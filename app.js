document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const infoPanel = document.getElementById('file-info');
    const infoContent = document.getElementById('info-content');
    const chartsContainer = document.getElementById('charts-container');
    const loading = document.getElementById('loading');
    const tr = (key, fallback = key) => (typeof getChartName === 'function' ? getChartName(key, fallback) : fallback);

    // 尝试获取 IP 及地理位置
    // 改用 JSONP 方式，以支持本地 file:// 协议运行时的跨域请求
    const displayIp = (ip, loc) => {
        const display = document.getElementById('cf-ip-display');
        if (display && ip) {
            // 避免重复显示
            if (display.textContent.includes(ip)) return;
            const locStr = loc ? ` - ${loc}` : '';
            display.innerText = `${tr('Your IP', 'Your IP')}: ${ip}${locStr}`;
            // 强制换行显示
            display.style.display = 'block';
            display.style.marginTop = '5px';
            display.style.fontSize = '0.9em';
            display.style.fontWeight = 'normal';
        }
    };

    const fetchJsonp = (url, callbackParam = 'callback') => {
        return new Promise((resolve, reject) => {
            const cbName = 'jsonp_' + Math.floor(Math.random() * 1000000);
            const script = document.createElement('script');
            let timeoutId;

            window[cbName] = (data) => {
                cleanup();
                resolve(data);
            };

            const cleanup = () => {
                if (window[cbName]) delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
                if (timeoutId) clearTimeout(timeoutId);
            };

            script.onerror = () => {
                cleanup();
                reject(new Error(`JSONP failed for ${url}`));
            };

            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`JSONP timeout for ${url}`));
            }, 5000);

            const delim = url.includes('?') ? '&' : '?';
            script.src = `${url}${delim}${callbackParam}=${cbName}`;
            document.body.appendChild(script);
        });
    };

    // 智能选择 IP 获取策略
    const runGeoIp = async () => {
        const isHttps = window.location.protocol === 'https:';

        if (isHttps) {
            // --- 策略 A: HTTPS (线上部署) ---
            // 1. 首选 ipwho.is (HTTPS, CORS支持, 中文)
            try {
                const res = await fetch('https://ipwho.is/?lang=zh-CN');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        const loc = [data.city, data.country].filter(Boolean).join(', ');
                        displayIp(data.ip, loc);
                        return;
                    }
                }
            } catch (e) { /* ignore */ }

            // 2. 尝试 Cloudflare Trace
            try {
                const res = await fetch('/cdn-cgi/trace');
                if (res.ok) {
                    const text = await res.text();
                    const ip = text.match(/ip=([^\n]+)/)?.[1];
                    const loc = text.match(/loc=([^\n]+)/)?.[1]; 
                    if (ip) {
                        displayIp(ip, loc);
                        return;
                    }
                }
            } catch (e) { /* ignore */ }

            // 3. 尝试 DB-IP
            try {
                const res = await fetch('https://api.db-ip.com/v2/free/self');
                if (res.ok) {
                    const data = await res.json();
                    const loc = [data.city, data.countryName].filter(Boolean).join(', ');
                    displayIp(data.ipAddress, loc);
                    return;
                }
            } catch (e) { /* ignore */ }

            // 4. 兜底: Ipify
            try {
                const res = await fetch('https://api.ipify.org?format=json');
                if (res.ok) {
                    const data = await res.json();
                    displayIp(data.ip, '');
                }
            } catch (e) { console.warn('All HTTPS GeoIP failed'); }

        } else {
            // --- 策略 B: 本地 file:// 或 HTTP 环境 ---
            fetchJsonp('http://ip-api.com/json/?lang=zh-CN')
                .then(data => {
                    if (data.status === 'success') {
                        displayIp(data.query, [data.city, data.country].filter(Boolean).join(', '));
                    } else {
                        throw new Error('ip-api Error');
                    }
                })
                .catch(() => {
                    return fetchJsonp('https://api.ipify.org?format=jsonp')
                        .then(data => displayIp(data.ip, ''));
                })
                .catch(e => console.warn('Local GeoIP failed:', e));
        }
    };

    runGeoIp();

    // 拖拽事件处理
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) processFile(files[0]);
    });

    // 点击上传
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processFile(e.target.files[0]);
    });

    function processFile(file) {
        if (!file.name.endsWith('.aclog')) {
            alert(tr('Please upload a .aclog file', 'Please upload a .aclog file'));
            return;
        }

        // UI Reset
        chartsContainer.classList.add('hidden');
        infoPanel.classList.add('hidden');
        loading.classList.remove('hidden');
        chartsContainer.innerHTML = ''; 

        // 重置进度条
        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');
        if (progressBar) progressBar.style.width = '0%';
        if (progressBar) progressBar.innerText = '0%';
        if (loadingText) loadingText.innerText = tr('Reading file...', 'Reading file...');

        const reader = new FileReader();
        
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 50); 
                if (progressBar) progressBar.style.width = percent + '%';
                if (progressBar) progressBar.innerText = percent + '%';
            }
        };

        reader.onload = (e) => {
             if (loadingText) loadingText.innerText = tr('Parsing data...', 'Parsing data...');
             setTimeout(() => {
                try {
                    analyzeDataAsync(e.target.result, file);
                } catch (err) {
                     console.error(err);
                     alert(tr('Parse Error', 'Parse Error') + ': ' + err.message);
                     loading.classList.add('hidden');
                }
             }, 50);
        };
        reader.readAsArrayBuffer(file);
    }

    function analyzeDataAsync(arrayBuffer, file) {
        const parser = new ACLoreParser(arrayBuffer);
        const progressBar = document.getElementById('progress-bar');
        
        try {
            parser.startParse();
        } catch (e) {
            alert(tr('Header Parse Failed', 'Header Parse Failed') + ': ' + e.message);
            loading.classList.add('hidden');
            return;
        }

        const CHUNK_SIZE = 500000; 
        
        function step() {
            try {
                const progress = parser.parseStep(CHUNK_SIZE);
                
                const totalPercent = Math.floor(50 + progress * 50);
                if (progressBar) {
                    progressBar.style.width = totalPercent + '%';
                    progressBar.innerText = totalPercent + '%';
                }

                if (progress < 1.0) {
                    requestAnimationFrame(step);
                } else {
                    const data = parser.getResult();
                    buildEstimatorInfoGroup(data);
                    calculateNoise(data);
                    calculateFFT(data);
                    calculateSpectrogram(data);
                    buildPosVelComparisonCharts(data);
                    buildRealtimeUsedSensorChart(data);
                    buildRealtimeUsedSensorComparisonCharts(data);
                    displayInfo(data.header, data.stats, file, data.datasets);
                    renderCharts(data);
                    
                    loading.classList.add('hidden');
                    infoPanel.classList.remove('hidden');
                    chartsContainer.classList.remove('hidden');
                }
            } catch (err) {
                 console.error(err);
                 alert(tr('Parse Step Error', 'Parse Step Error') + ': ' + err.message);
                 loading.classList.add('hidden');
            }
        }

        requestAnimationFrame(step);
    }

    function buildEstimatorInfoGroup(data) {
        if (!data || !data.datasets) return;

        const mappings = [
            { key: 'LocalPosition_Pos', subgroupKey: 'Estimator_Info_Sub_Pos', subgroupName: 'Estimator Position' },
            { key: 'LocalPosition_Vel', subgroupKey: 'Estimator_Info_Sub_Vel', subgroupName: 'Estimator Velocity' },
            { key: 'LocalPosition_Acc', subgroupKey: 'Estimator_Info_Sub_Acc', subgroupName: 'Estimator Acceleration' }
        ];

        for (const item of mappings) {
            const ds = data.datasets[item.key];
            if (!ds || !ds.data || !ds.data.Time || ds.data.Time.length === 0) continue;
            ds.groupKey = 'Estimator_Info';
            ds.groupName = 'Estimator Info';
            ds.subgroupKey = item.subgroupKey;
            ds.subgroupName = item.subgroupName;
        }
    }

    function displayInfo(header, stats, file, datasets) {
        let countsStr = '';
        for (const [type, count] of Object.entries(stats.frameCounts)) {
            let name = 'Unknown';
            if (typeof MessageDefs !== 'undefined' && MessageDefs[type]) {
                const rawName = MessageDefs[type].name;
                name = (typeof getChartName === 'function') ? getChartName(rawName, rawName) : rawName;
            }
            countsStr += `<li>${name} (${type}): ${count}</li>`;
        }

        const dateStr = file && file.lastModified ? new Date(file.lastModified).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unknown';
        let sensorOverviewStr = `<li>${tr('No position/velocity sensors detected', 'No position/velocity sensors detected')}</li>`;

        if (datasets) {
            const sensorItems = [];
            for (const [key, ds] of Object.entries(datasets)) {
                if (!key.startsWith('PosSensor_')) continue;
                if (key.includes('_vs_Est_')) continue;
                const cat = tr(ds.sensorCategory || 'Unclassified Sensor', ds.sensorCategory || 'Unclassified Sensor');
                sensorItems.push(`${cat} ${key}`);
            }
            sensorItems.sort();
            if (sensorItems.length > 0) {
                sensorOverviewStr = sensorItems.map(item => `<li>${item}</li>`).join('');
            }
        }
        
        infoContent.innerHTML = `
            <p><strong>${tr('Description', 'Description')}:</strong> ${header.description}</p>
            <p><strong>${tr('Version', 'Version')}:</strong> ${header.verMain}.${header.verSub}</p>
            <p><strong>${tr('File Date', 'File Date')}:</strong> ${dateStr}</p>
            <p><strong>${tr('Total Frames', 'Total Frames')}:</strong> ${stats.totalFrames}</p>
            <p><strong>${tr('Unknown/Ignored Frames', 'Unknown/Ignored Frames')}:</strong> ${stats.unknownFrames}</p>
            <p><strong>${tr('Frame Type Statistics', 'Frame Type Statistics')}:</strong></p>
            <ul>${countsStr}</ul>
            <p><strong>${tr('Sensor Overview', 'Sensor Overview')}:</strong></p>
            <ul>${sensorOverviewStr}</ul>
        `;
    }

    function calculateNoise(data) {
        const accData = data.datasets['LocalPosition_Acc'];
        if (!accData) return;

        const time = accData.data.Time;
        const accX = accData.data.AccX;
        const accY = accData.data.AccY;
        const accZ = accData.data.AccZ;
        
        if (!time || !accX || !accY || !accZ) return;

        const len = time.length;
        const rangeX = new Float64Array(len);
        const rangeY = new Float64Array(len);
        const rangeZ = new Float64Array(len);
        
        const windowSize = 0.1; 
        
        function computeRange(input, output) {
             let left = 0;
             for (let right = 0; right < len; right++) {
                 while (time[right] - time[left] > windowSize) {
                     left++;
                 }
                 let min = input[right];
                 let max = input[right];
                 for (let k = left; k < right; k++) {
                     const val = input[k];
                     if (val < min) min = val;
                     if (val > max) max = val;
                 }
                 output[right] = max - min;
             }
        }

        computeRange(accX, rangeX);
        computeRange(accY, rangeY);
        computeRange(accZ, rangeZ);
        
        data.datasets['IMU_Noise_Range'] = {
            name: 'IMU Noise Analysis (0.1s Range/Peak-to-Peak)',
            data: {
                Time: time, 
                RangeX: rangeX,
                RangeY: rangeY,
                RangeZ: rangeZ
            }
        };

        const varX = new Float64Array(len);
        const varY = new Float64Array(len);
        const varZ = new Float64Array(len);

        function computeVar(input, output) {
             let left = 0;
             let sum = 0;
             let sumSq = 0;
             for (let right = 0; right < len; right++) {
                 const val = input[right];
                 sum += val;
                 sumSq += val * val;
                 while (time[right] - time[left] > windowSize) {
                     const removeVal = input[left];
                     sum -= removeVal;
                     sumSq -= removeVal * removeVal;
                     left++;
                 }
                 const count = right - left + 1;
                 if (count > 1) {
                     let v = (sumSq - (sum * sum) / count) / count; 
                     output[right] = v > 0 ? v : 0;
                 } else {
                     output[right] = 0;
                 }
             }
        }

        computeVar(accX, varX);
        computeVar(accY, varY);
        computeVar(accZ, varZ);
        
        data.datasets['IMU_Noise_Var'] = {
            name: 'IMU Noise Analysis (0.1s Variance)',
            data: {
                Time: time,
                VarX: varX,
                VarY: varY,
                VarZ: varZ
            }
        };
    }

    function calculateFFT(data) {
        const accData = data.datasets['LocalPosition_Acc'];
        if (!accData) return;

        const time = accData.data.Time;
        const accDataMap = {
            AccX: accData.data.AccX,
            AccY: accData.data.AccY,
            AccZ: accData.data.AccZ
        };
        
        if (!time || time.length < 128) return;

        const duration = time[time.length - 1] - time[0];
        const count = time.length;
        if (duration <= 0) return;
        const avgFs = (count - 1) / duration;
        
        const fftSize = 4096; 
        if (count < fftSize) return; 
        
        const window = new Float64Array(fftSize);
        for(let i=0; i<fftSize; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
        }

        function fftIterations(re, im) {
            const n = re.length;
            const levels = Math.log2(n);
            for (let i = 0; i < n; i++) {
                let rev = 0;
                let val = i;
                for (let j = 0; j < levels; j++) {
                    rev = (rev << 1) | (val & 1);
                    val >>>= 1;
                }
                if (rev > i) {
                    const tr = re[i]; re[i] = re[rev]; re[rev] = tr;
                    const ti = im[i]; im[i] = im[rev]; im[rev] = ti;
                }
            }
            for (let size = 2; size <= n; size *= 2) {
                const half = size / 2;
                const angle = -2 * Math.PI / size;
                const wStepRe = Math.cos(angle);
                const wStepIm = Math.sin(angle);
                for (let i = 0; i < n; i += size) {
                    let wRe = 1;
                    let wIm = 0;
                    for (let j = 0; j < half; j++) {
                        const even = i + j;
                        const odd = i + j + half;
                        const tRe = wRe * re[odd] - wIm * im[odd];
                        const tIm = wRe * im[odd] + wIm * re[odd];
                        re[odd] = re[even] - tRe;
                        im[odd] = im[even] - tIm;
                        re[even] = re[even] + tRe;
                        im[even] = im[even] + tIm;
                        const wTemp = wRe;
                        wRe = wRe * wStepRe - wIm * wStepIm;
                        wIm = wTemp * wStepIm + wIm * wStepRe;
                    }
                }
            }
        }
        
        const hopSize = fftSize / 2;
        const numSegments = Math.floor((count - fftSize) / hopSize) + 1;
        
        const finalData = {};

        for (const [key, signal] of Object.entries(accDataMap)) {
            if (!signal) continue;
            const avgSpec = new Float64Array(fftSize / 2);
            const re = new Float64Array(fftSize);
            const im = new Float64Array(fftSize);
            let segmentsProcessed = 0;
            
            for (let i = 0; i < numSegments; i++) {
                const start = i * hopSize;
                for(let j=0; j<fftSize; j++) {
                    re[j] = signal[start + j] * window[j];
                    im[j] = 0;
                }
                fftIterations(re, im);
                for(let j=0; j<fftSize/2; j++) {
                    const mag = Math.sqrt(re[j]*re[j] + im[j]*im[j]);
                    avgSpec[j] += mag;
                }
                segmentsProcessed++;
            }
            const norm = 4.0 / fftSize / segmentsProcessed;
            for(let j=0; j<fftSize/2; j++) {
                avgSpec[j] *= norm;
            }
            avgSpec[0] = 0; 
            finalData['FFT_' + key] = avgSpec;
        }

        const freqs = new Float64Array(fftSize / 2);
        const df = avgFs / fftSize;
        const limitHz = avgFs / 2;
        for(let i=0; i<fftSize/2; i++) {
            const f = i * df;
            if (f > limitHz) break;
            freqs[i] = f;
        }
        
        data.datasets['IMU_Acc_FFT'] = {
            name: `IMU Acc FFT Analysis (Avg Fs: ${avgFs.toFixed(1)}Hz)`,
            xAxisLabel: 'Frequency (Hz)',
            data: {
                Time: freqs, 
                ...finalData
            }
        };
    }

    function calculateSpectrogram(data) {
        const accData = data.datasets['LocalPosition_Acc'];
        if (!accData) return;

        const time = accData.data.Time;
        const accX = accData.data.AccX;
        const accY = accData.data.AccY;
        const accZ = accData.data.AccZ;
        
        if (!time || time.length < 512) return;

        const duration = time[time.length - 1] - time[0];
        const count = time.length;
        if (duration <= 0) return;
        const avgFs = (count - 1) / duration;

        // 2. Settings Optimization
        // Use a time-window-based FFT size to avoid time smearing at low sample rates.
        const targetWindowSec = 1.0;
        let fftSize = 1;
        const targetSamples = avgFs * targetWindowSec;
        while (fftSize < targetSamples) fftSize *= 2;
        if (fftSize < 256) fftSize = 256;
        if (fftSize > 2048) fftSize = 2048;

        const hopSize = Math.floor(fftSize / 4);
        const numBins = fftSize / 2;
        
        const window = new Float64Array(fftSize);
        for(let i=0; i<fftSize; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
        }

        const bitRev = new Uint16Array(fftSize);
        const levels = Math.log2(fftSize);
        for (let i = 0; i < fftSize; i++) {
            let rev = 0, val = i;
            for (let j = 0; j < levels; j++) { rev = (rev << 1) | (val & 1); val >>>= 1; }
            bitRev[i] = rev;
        }

        const zValues = []; 
        const xValues = [];
        
        const re = new Float64Array(fftSize);
        const im = new Float64Array(fftSize);
        const binPower = new Float64Array(numBins);
        
        // 移除最大段数限制
        // 直接使用 calculated hopSize (75% overlap)，这将生成像素密度最高的频谱图
        // 哪怕这会导致生成的 Canvas 异常巨大 (注意：过大的 Canvas 可能会在移动端遇到兼容性问题)
        const realHop = hopSize;

        let maxDB = -Infinity; 

        const signals = [accX, accY, accZ];

        for (let i = 0; i <= count - fftSize; i += realHop) {
            const tCenter = time[0] + (i + fftSize / 2) / avgFs;
            xValues.push(tCenter);

            const binPower = new Float64Array(numBins);

            for(let axis=0; axis<3; axis++) {
                const signal = signals[axis];
                if (!signal) continue;
                
                let mean = 0;
                for (let k = 0; k < fftSize; k++) mean += signal[i + k];
                mean /= fftSize;

                for (let k = 0; k < fftSize; k++) {
                    re[k] = (signal[i + k] - mean) * window[k];
                    im[k] = 0;
                }

                for (let k = 0; k < fftSize; k++) {
                   const r = bitRev[k];
                   if (r > k) {
                       const tr = re[k]; re[k] = re[r]; re[r] = tr;
                       const ti = im[k]; im[k] = im[r]; im[r] = ti;
                   }
                }

                for (let size = 2; size <= fftSize; size *= 2) {
                    const half = size / 2;
                    const angle = -2 * Math.PI / size;
                    const wStepRe = Math.cos(angle);
                    const wStepIm = Math.sin(angle);
                    
                    for (let j = 0; j < fftSize; j += size) {
                        let wRe = 1;
                        let wIm = 0;
                        for (let k = 0; k < half; k++) {
                            const even = j + k;
                            const odd = j + k + half;
                            
                            const tRe = wRe * re[odd] - wIm * im[odd];
                            const tIm = wRe * im[odd] + wIm * re[odd];
                            
                            re[odd] = re[even] - tRe;
                            im[odd] = im[even] - tIm;
                            re[even] = re[even] + tRe;
                            im[even] = im[even] + tIm;
                            
                            const wTemp = wRe;
                            wRe = wRe * wStepRe - wIm * wStepIm;
                            wIm = wTemp * wStepIm + wIm * wStepRe;
                        }
                    }
                }

                for (let k = 0; k < numBins; k++) {
                    binPower[k] += (re[k] * re[k] + im[k] * im[k]);
                }
            }

            const row = [];
            for (let k = 0; k < numBins; k++) {
                let p = binPower[k];
                if (p < 1e-10) p = 1e-10;
                const db = 10 * Math.log10(p);
                if (db > maxDB) maxDB = db;
                row.push(db);
            }
            zValues.push(row);
        }

        const zTransposed = [];
        for (let f = 0; f < numBins; f++) {
            const freqRow = new Float64Array(zValues.length);
            for (let t = 0; t < zValues.length; t++) {
                freqRow[t] = zValues[t][f];
            }
            zTransposed.push(freqRow);
        }

        const yValues = new Float64Array(numBins);
        const df = avgFs / fftSize;
        const cutoff = avgFs / 2;
        for (let k = 0; k < numBins; k++) {
            const f = k * df;
            if (f > cutoff) break;
            yValues[k] = f;
        }

        data.datasets['IMU_Spectrogram'] = {
            name: 'IMU Vibration Spectrogram (Combined Power)',
            type: 'spectrogram',
            maxDB: maxDB, 
            data: {
                x: xValues,
                y: yValues,
                z: zTransposed
            }
        };
    }

    function buildPosVelComparisonCharts(data) {
        const estPos = data.datasets['LocalPosition_Pos'];
        const estVel = data.datasets['LocalPosition_Vel'];
        if (!estPos && !estVel) return;

        const isAllZero = (arr) => {
            if (!arr || arr.length === 0) return true;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] !== 0) return false;
            }
            return true;
        };

        const pickActiveFields = (sensor, fields) => {
            const active = [];
            for (const f of fields) {
                const arr = sensor.data[f];
                if (arr && !isAllZero(arr)) active.push(f);
            }
            return active;
        };

        const classifySensorCategory = (activePosFields, activeVelFields) => {
            const hasPosX = activePosFields.includes('PosX');
            const hasPosY = activePosFields.includes('PosY');
            const hasPosZ = activePosFields.includes('PosZ');
            const hasVelX = activeVelFields.includes('VelX');
            const hasVelY = activeVelFields.includes('VelY');
            const hasVelZ = activeVelFields.includes('VelZ');

            const posXYOnly = hasPosX && hasPosY && !hasPosZ;
            const velXYOnly = hasVelX && hasVelY && !hasVelZ;
            const posXYZ = hasPosX && hasPosY && hasPosZ;
            const velXYZ = hasVelX && hasVelY && hasVelZ;
            const onlyPos = activeVelFields.length === 0 && activePosFields.length > 0;
            const onlyVel = activePosFields.length === 0 && activeVelFields.length > 0;

            if (onlyPos && posXYOnly) return 'Horizontal Position Sensor';
            if (onlyVel && velXYOnly) return 'Horizontal Velocity Sensor';
            if (posXYOnly && velXYOnly) return 'Horizontal Position+Velocity Sensor';
            if (onlyPos && hasPosZ && !hasPosX && !hasPosY) return 'Altitude Sensor';
            if (onlyPos && posXYZ) return '3D Position Sensor';
            if (posXYZ && velXYZ) return '3D Position+Velocity Sensor';
            if (onlyVel && velXYZ) return '3D Velocity Sensor';
            return 'Unclassified Sensor';
        };

        const nearestIndex = (timeArr, t) => {
            if (!timeArr || timeArr.length === 0) return -1;
            let left = 0;
            let right = timeArr.length - 1;
            while (left < right) {
                const mid = (left + right) >> 1;
                if (timeArr[mid] < t) left = mid + 1;
                else right = mid;
            }
            const idx = left;
            if (idx === 0) return 0;
            const prev = idx - 1;
            return Math.abs(timeArr[idx] - t) < Math.abs(timeArr[prev] - t) ? idx : prev;
        };

        const buildSeries = (sensor, estimator, fields, inspectLabel, groupKey, groupName, subgroupKey, subgroupName) => {
            if (!sensor || !estimator) return null;
            const sTime = sensor.data.Time;
            const eTime = estimator.data.Time;
            if (!sTime || !eTime || sTime.length === 0 || eTime.length === 0) return null;

            const sensorFieldName = (f) => `Sensor${f}`;
            const localPosFieldName = (f) => `LocalPosition_${f}`;

            const aligned = { Time: new Float64Array(sTime.length) };
            for (const f of fields) {
                aligned[sensorFieldName(f)] = new Float64Array(sTime.length);
                aligned[localPosFieldName(f)] = new Float64Array(sTime.length);
                aligned[`Err_${f}`] = new Float64Array(sTime.length);
            }

            const matchIndex = new Int32Array(sTime.length);
            for (let i = 0; i < sTime.length; i++) {
                const j = nearestIndex(eTime, sTime[i]);
                matchIndex[i] = j;
            }

            for (let i = 0; i < sTime.length; i++) {
                const t = sTime[i];
                const j = matchIndex[i];
                if (j < 0) continue;
                aligned.Time[i] = t;
                for (const f of fields) {
                    const sArr = sensor.data[f];
                    const eArr = estimator.data[f];
                    if (!sArr || !eArr) continue;
                    const sv = sArr[i];
                    const ev = eArr[j];
                    aligned[sensorFieldName(f)][i] = sv;
                    aligned[localPosFieldName(f)][i] = ev;
                    aligned[`Err_${f}`][i] = sv - ev;
                }
            }

            const out = {};
            for (const f of fields) {
                out[f] = {
                    name: `${f} Inspect`,
                    groupKey: groupKey,
                    groupName: groupName,
                    subgroupKey: subgroupKey,
                    subgroupName: subgroupName,
                    data: {
                        Time: aligned.Time,
                        [sensorFieldName(f)]: aligned[sensorFieldName(f)],
                        [localPosFieldName(f)]: aligned[localPosFieldName(f)],
                        [`Err_${f}`]: aligned[`Err_${f}`]
                    }
                };
            }
            return out;
        };

        for (const [key, ds] of Object.entries(data.datasets)) {
            if (!key.startsWith('PosSensor_')) continue;

            const activePosFields = pickActiveFields(ds, ['PosX', 'PosY', 'PosZ']);
            const activeVelFields = pickActiveFields(ds, ['VelX', 'VelY', 'VelZ']);

            const keptFields = ['Time', ...activePosFields, ...activeVelFields];
            if (keptFields.length > 1) {
                ds.fieldNames = keptFields;
            }

            const hasPos = activePosFields.length > 0;
            const hasVel = activeVelFields.length > 0;
            const combinedGroup = hasPos && hasVel;
            const sensorCategory = classifySensorCategory(activePosFields, activeVelFields);

            ds.sensorCategory = sensorCategory;
            ds.name = `${key} (${sensorCategory})`;

            const sensorPanelGroupKey = `SensorPanel_${key}`;
            const sensorPanelGroupName = `${key} (${sensorCategory})`;
            ds.groupKey = sensorPanelGroupKey;
            ds.groupName = sensorPanelGroupName;
            ds.subgroupKey = undefined;
            ds.subgroupName = undefined;

            const posGroupKey = sensorPanelGroupKey;
            const velGroupKey = sensorPanelGroupKey;
            const posGroupName = sensorPanelGroupName;
            const velGroupName = sensorPanelGroupName;
            const posSubgroupKey = `${sensorPanelGroupKey}_Sub_PosInspect`;
            const velSubgroupKey = `${sensorPanelGroupKey}_Sub_VelInspect`;
            const posSubgroupName = 'Pos Inspect';
            const velSubgroupName = 'Vel Inspect';

            if (hasPos && estPos) {
                const posComp = buildSeries(ds, estPos, activePosFields, `${key}`, posGroupKey, posGroupName, posSubgroupKey, posSubgroupName);
                if (posComp) {
                    if (posComp.PosX) data.datasets[`${key}_vs_Est_PosX`] = posComp.PosX;
                    if (posComp.PosY) data.datasets[`${key}_vs_Est_PosY`] = posComp.PosY;
                    if (posComp.PosZ) data.datasets[`${key}_vs_Est_PosZ`] = posComp.PosZ;
                }
            }

            if (hasVel && estVel) {
                const velComp = buildSeries(ds, estVel, activeVelFields, `${key}`, velGroupKey, velGroupName, velSubgroupKey, velSubgroupName);
                if (velComp) {
                    if (velComp.VelX) data.datasets[`${key}_vs_Est_VelX`] = velComp.VelX;
                    if (velComp.VelY) data.datasets[`${key}_vs_Est_VelY`] = velComp.VelY;
                    if (velComp.VelZ) data.datasets[`${key}_vs_Est_VelZ`] = velComp.VelZ;
                }
            }
        }
    }

    function buildRealtimeUsedSensorChart(data) {
        const localPos = data.datasets['LocalPosition_Pos'];
        if (!localPos || !localPos.data || !localPos.data.Time || !localPos.data.XYSensor || !localPos.data.ZSensor) return;

        const sensorsById = new Map();

        for (const [key, ds] of Object.entries(data.datasets)) {
            if (!key.startsWith('PosSensor_')) continue;
            if (key.includes('_vs_Est_')) continue;
            if (!ds.data || !ds.data.Time) continue;

            const parts = key.split('_');
            if (parts.length < 3) continue;
            const sensorId = parseInt(parts[1], 10);
            if (!Number.isFinite(sensorId)) continue;

            const hasPosX = !!ds.data.PosX;
            const hasPosY = !!ds.data.PosY;
            const hasPosZ = !!ds.data.PosZ;
            if (!hasPosX && !hasPosY && !hasPosZ) continue;

            if (!sensorsById.has(sensorId)) sensorsById.set(sensorId, []);
            sensorsById.get(sensorId).push({
                key,
                ds,
                score: (hasPosX ? 1 : 0) + (hasPosY ? 1 : 0) + (hasPosZ ? 1 : 0)
            });
        }

        if (sensorsById.size === 0) return;

        const pickBestDataset = (sensorId, needXY) => {
            const list = sensorsById.get(sensorId);
            if (!list || list.length === 0) return null;

            let best = null;
            let bestScore = -1;
            for (const item of list) {
                const hasXY = !!item.ds.data.PosX && !!item.ds.data.PosY;
                const hasZ = !!item.ds.data.PosZ;
                const fit = needXY ? (hasXY ? 2 : 0) : (hasZ ? 2 : 0);
                const total = fit * 10 + item.score;
                if (total > bestScore) {
                    bestScore = total;
                    best = item.ds;
                }
            }
            return best;
        };

        const nearestIndex = (timeArr, t) => {
            if (!timeArr || timeArr.length === 0) return -1;
            let left = 0;
            let right = timeArr.length - 1;
            while (left < right) {
                const mid = (left + right) >> 1;
                if (timeArr[mid] < t) left = mid + 1;
                else right = mid;
            }
            const idx = left;
            if (idx === 0) return 0;
            const prev = idx - 1;
            return Math.abs(timeArr[idx] - t) < Math.abs(timeArr[prev] - t) ? idx : prev;
        };

        const tArr = localPos.data.Time;
        const xyIdArr = localPos.data.XYSensor;
        const zIdArr = localPos.data.ZSensor;
        const n = tArr.length;

        const usedPosX = new Float64Array(n);
        const usedPosY = new Float64Array(n);
        const usedPosZ = new Float64Array(n);
        const usedXYId = new Float64Array(n);
        const usedZId = new Float64Array(n);

        for (let i = 0; i < n; i++) {
            usedPosX[i] = NaN;
            usedPosY[i] = NaN;
            usedPosZ[i] = NaN;

            const t = tArr[i];
            const xyId = Math.round(xyIdArr[i]);
            const zId = Math.round(zIdArr[i]);
            usedXYId[i] = xyId;
            usedZId[i] = zId;

            const xySensor = pickBestDataset(xyId, true);
            if (xySensor && xySensor.data.Time) {
                const j = nearestIndex(xySensor.data.Time, t);
                if (j >= 0) {
                    if (xySensor.data.PosX) usedPosX[i] = xySensor.data.PosX[j];
                    if (xySensor.data.PosY) usedPosY[i] = xySensor.data.PosY[j];
                }
            }

            const zSensor = pickBestDataset(zId, false);
            if (zSensor && zSensor.data.Time) {
                const k = nearestIndex(zSensor.data.Time, t);
                if (k >= 0 && zSensor.data.PosZ) {
                    usedPosZ[i] = zSensor.data.PosZ[k];
                }
            }
        }

        data.datasets['FC_UsedSensors_Pos'] = {
            name: 'Realtime Used Sensor Position (XYSensor/ZSensor)',
            groupKey: 'FC_UsedSensors_Pos_Panel',
            groupName: 'Realtime Used Sensor Position (XYSensor/ZSensor)',
            data: {
                Time: tArr,
                UsedPosX: usedPosX,
                UsedPosY: usedPosY,
                UsedPosZ: usedPosZ,
                XYSensorId: usedXYId,
                ZSensorId: usedZId
            }
        };
    }

    function buildRealtimeUsedSensorComparisonCharts(data) {
        const used = data.datasets['FC_UsedSensors_Pos'];
        const estPos = data.datasets['LocalPosition_Pos'];
        if (!used || !used.data || !estPos || !estPos.data) return;

        const t = used.data.Time;
        const axes = [
            { name: 'PosX', usedKey: 'UsedPosX', estKey: 'PosX' },
            { name: 'PosY', usedKey: 'UsedPosY', estKey: 'PosY' },
            { name: 'PosZ', usedKey: 'UsedPosZ', estKey: 'PosZ' }
        ];

        const isFiniteNumber = (v) => Number.isFinite(v);

        for (const axis of axes) {
            const usedArr = used.data[axis.usedKey];
            const estArr = estPos.data[axis.estKey];
            if (!usedArr || !estArr || usedArr.length !== estArr.length) continue;

            const n = usedArr.length;
            const err = new Float64Array(n);

            for (let i = 0; i < n; i++) {
                const uv = usedArr[i];
                const ev = estArr[i];
                if (isFiniteNumber(uv) && isFiniteNumber(ev)) {
                    const diff = uv - ev;
                    err[i] = diff;
                } else {
                    err[i] = NaN;
                }
            }

            data.datasets[`FC_UsedSensors_Pos_vs_Est_${axis.name}`] = {
                name: `${axis.name} Inspect`,
                groupKey: 'FC_UsedSensors_Pos_Panel',
                groupName: 'Realtime Used Sensor Position (XYSensor/ZSensor)',
                subgroupKey: 'FC_UsedSensors_Pos_Panel_Sub_Pos',
                subgroupName: 'Pos Inspect',
                data: {
                    Time: t,
                    [`Used${axis.name}`]: usedArr,
                    [`LocalPosition_${axis.name}`]: estArr,
                    [`Err_${axis.name}`]: err
                }
            };
        }
    }

    function renderCharts(data) {
        chartsContainer.innerHTML = ''; 

        const palette = [
            "#f44336", "#2196f3", "#4caf50", "#ff9800", "#9c27b0", 
            "#3f51b5", "#00bcd4", "#795548", "#607d8b", "#e91e63"
        ];

        const trComposite = (text) => {
            if (typeof text !== 'string' || text.length === 0) return text;
            const m = text.match(/^(.*)\s\((.*)\)$/);
            if (!m) return tr(text, text);
            const left = (m[1] || '').trim();
            const right = (m[2] || '').trim();
            return `${tr(left, left)} (${tr(right, right)})`;
        };

        const trInspectTitle = (text) => {
            if (typeof text !== 'string' || text.length === 0) return text;

            const axisOnlyInspect = text.match(/^([A-Za-z0-9_]+)\sInspect$/);
            if (axisOnlyInspect) {
                const axis = axisOnlyInspect[1];
                if (axis.startsWith('Pos')) {
                    const key = `Sensor ${axis} vs Estimator Position ${axis}`;
                    return tr(key, key);
                }
                if (axis.startsWith('Vel')) {
                    const key = `Sensor ${axis} vs Estimator Velocity ${axis}`;
                    return tr(key, key);
                }
            }

            const axisInspect = text.match(/^(.*)\s([A-Za-z0-9_]+)\sInspect$/);
            if (axisInspect) {
                const base = (axisInspect[1] || '').trim();
                const axis = axisInspect[2];
                const baseText = trComposite(base);
                if (!baseText) return `${axis} ${tr('Inspect', 'Inspect')}`;
                return `${baseText} ${axis} ${tr('Inspect', 'Inspect')}`;
            }

            if (text.endsWith(' Pos Inspect')) {
                const base = text.slice(0, -' Pos Inspect'.length).trim();
                return `${trComposite(base)} ${tr('Pos Inspect', 'Pos Inspect')}`;
            }
            if (text.endsWith(' Vel Inspect')) {
                const base = text.slice(0, -' Vel Inspect'.length).trim();
                return `${trComposite(base)} ${tr('Vel Inspect', 'Vel Inspect')}`;
            }

            return trComposite(text);
        };

        const getDisplayChartTitle = (datasetKey, datasetObj) => {
            if (datasetKey === 'FC_UsedSensors_Pos') return tr('Realtime Used Sensor Data', 'Realtime Used Sensor Data');

            const isEstimatorInfo = datasetKey === 'LocalPosition_Pos' || datasetKey === 'LocalPosition_Vel' || datasetKey === 'LocalPosition_Acc';
            if (isEstimatorInfo) return '';

            const isRawSensor = datasetKey.startsWith('PosSensor_') && !datasetKey.includes('_vs_Est_');
            if (isRawSensor) return tr('Sensor Data', 'Sensor Data');
            return trInspectTitle(getChartName(datasetKey, datasetObj.name));
        };

        const getExportChartTitle = (datasetKey, datasetObj) => {
            if (datasetKey === 'FC_UsedSensors_Pos') return tr('Realtime Used Sensor Data', 'Realtime Used Sensor Data');

            const isRawSensor = datasetKey.startsWith('PosSensor_') && !datasetKey.includes('_vs_Est_');
            if (isRawSensor) return tr('Sensor Data', 'Sensor Data');
            return trInspectTitle(getChartName(datasetKey, datasetObj.name));
        };

        let trajSource = null;

        const observerOptions = {
            root: null, 
            rootMargin: '200px', 
            threshold: 0
        };

        const chartObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    const chartFn = target._initChart; 
                    if (chartFn) {
                        chartFn(); 
                        target._initChart = null; 
                        target.classList.remove('pending-chart');
                    }
                    observer.unobserve(target); 
                }
            });
        }, observerOptions);

        const isDebugText = (text) => typeof text === 'string' && /debug/i.test(text);
        const isInspectText = (text) => typeof text === 'string' && /\binspect\b/i.test(text);
        const shouldDefaultCollapseGroup = (groupKey, groupName) => isDebugText(groupKey) || isDebugText(groupName);
        const shouldDefaultCollapseSubgroup = (subgroupKey, subgroupName) => isInspectText(subgroupKey) || isInspectText(subgroupName);
        const shouldDefaultCollapseChart = (datasetKey, datasetObj) => {
            const dsName = datasetObj?.name || '';
            if (isDebugText(datasetKey) || isDebugText(dsName)) return true;
            if (datasetObj?.groupKey) return false;
            return datasetKey.includes('_vs_Est_') || isInspectText(dsName);
        };

        const getHelpTextByContext = (ctx) => {
            const kind = ctx?.kind || 'chart';
            const key = ctx?.key || '';
            const groupKey = ctx?.groupKey || '';
            const subgroupKey = ctx?.subgroupKey || '';
            const datasetName = ctx?.dataset?.name || '';

            if (kind === 'group') {
                if (groupKey === 'Estimator_Info') return tr('Help Estimator Info', 'Contains estimator position/velocity/acceleration charts for state tracking consistency.');
                if (groupKey.startsWith('SensorPanel_PosSensor_')) return tr('Help Sensor Group', 'Contains raw sensor data and inspect comparisons for this sensor.');
                if (groupKey === 'FC_UsedSensors_Pos_Panel') return tr('Help FC Used Sensor Group', 'Contains realtime selected sensor values (XYSensor/ZSensor) and inspect comparisons versus estimator.');
                if (isDebugText(groupKey)) return tr('Help Debug Group', 'Contains debug diagnostics signals. These are engineering-oriented and may not map directly to physical units.');
                return tr('Help Generic Group', 'Contains multiple related charts. Expand subgroups for more detailed views.');
            }

            if (kind === 'subgroup') {
                if (/PosInspect/i.test(subgroupKey)) return tr('Help Pos Inspect Subgroup', 'Shows per-axis comparison between sensor position and estimator position.');
                if (/VelInspect/i.test(subgroupKey)) return tr('Help Vel Inspect Subgroup', 'Shows per-axis comparison between sensor velocity and estimator velocity.');
                if (isInspectText(subgroupKey)) return tr('Help Inspect Subgroup', 'Inspect subgroup: compare sensor signals with estimator and focus on error traces.');
                return tr('Help Generic Subgroup', 'Contains a subset of related charts under the same parent category.');
            }

            if (key === 'SystemState') return tr('Help SystemState', 'System state timeline, including core mode/state flags and status transitions.');
            if (key === 'Attitude' || key === 'AttitudeQuaternion') return tr('Help Attitude', 'Attitude information over time. Use this to inspect orientation behavior and continuity.');
            if (key === 'LocalPosition_Pos') return tr('Help LocalPosition_Pos', 'Estimator position output over time.');
            if (key === 'LocalPosition_Vel') return tr('Help LocalPosition_Vel', 'Estimator velocity output over time.');
            if (key === 'LocalPosition_Acc') return tr('Help LocalPosition_Acc', 'Estimator acceleration output over time.');
            if (key === 'ControlState_Thr') return tr('Help ControlState_Thr', 'Throttle control state signals over time.');
            if (key === 'MotorOutput') return tr('Help MotorOutput', 'Motor command/output channels over time. Useful for actuator saturation and balance checks.');
            if (key === 'IMU_Noise_Range') return tr('Help IMU_Noise_Range', '0.1s peak-to-peak range of acceleration. Higher values indicate stronger short-term vibration/noise.');
            if (key === 'IMU_Noise_Var') return tr('Help IMU_Noise_Var', '0.1s acceleration variance. Higher values indicate noisier local dynamics.');
            if (key === 'IMU_Acc_FFT') return tr('Help IMU_Acc_FFT', 'Frequency-domain magnitude of acceleration. Use to identify dominant vibration frequencies.');
            if (key === 'IMU_Spectrogram') return tr('Help IMU_Spectrogram', 'Time-frequency view of acceleration power. Track how vibration frequencies evolve over time.');
            if (key === 'FlightTrajectory_3D') return tr('Help FlightTrajectory_3D', '3D flight trajectory reconstructed from estimator position.');
            if (key === 'FC_UsedSensors_Pos') return tr('Help FC_UsedSensors_Pos', 'Realtime sensor values selected by flight controller via XYSensor/ZSensor.');
            if (key.includes('_vs_Est_') || isInspectText(datasetName)) return tr('Help Inspect Chart', 'Sensor-versus-estimator comparison chart. Observe axis error and consistency trends.');
            if (isDebugText(key) || isDebugText(datasetName)) return tr('Help Debug Chart', 'Debug diagnostic chart. Interpret with firmware context and message definitions.');

            return tr('Help Generic Chart', 'Use wheel to zoom, drag to pan, and reset/save tools for quick inspection.');
        };

        const createHelpButton = (getTitleText, getHelpText) => {
            const btn = document.createElement('button');
            btn.innerText = '?';
            btn.className = 'btn-tool';
            btn.title = tr('Show help', 'Show help');

            const bubble = document.createElement('div');
            bubble.style.position = 'fixed';
            bubble.style.maxWidth = '320px';
            bubble.style.padding = '8px 10px';
            bubble.style.borderRadius = '6px';
            bubble.style.background = 'rgba(0, 0, 0, 0.85)';
            bubble.style.color = '#fff';
            bubble.style.fontSize = '12px';
            bubble.style.lineHeight = '1.45';
            bubble.style.zIndex = '9999';
            bubble.style.display = 'none';
            bubble.style.pointerEvents = 'none';
            document.body.appendChild(bubble);

            let pinned = false;
            let hover = false;

            const updateBubbleContent = () => {
                const title = typeof getTitleText === 'function' ? getTitleText() : '';
                const helpText = typeof getHelpText === 'function'
                    ? getHelpText()
                    : tr('Help Generic Chart', 'Use wheel to zoom, drag to pan, and reset/save tools for quick inspection.');
                const titleText = title ? `${tr('Chart', 'Chart')}: ${title}<br/>` : '';
                bubble.innerHTML = `${titleText}${helpText}`;
            };

            const positionBubble = () => {
                const rect = btn.getBoundingClientRect();
                const margin = 8;
                const top = rect.top - margin;
                const left = rect.right + margin;
                bubble.style.left = `${left}px`;
                bubble.style.top = `${top}px`;
                bubble.style.transform = 'translateY(-100%)';
            };

            const showBubble = () => {
                updateBubbleContent();
                bubble.style.display = 'block';
                positionBubble();
            };

            const hideBubble = () => {
                bubble.style.display = 'none';
            };

            btn.addEventListener('mouseenter', () => {
                hover = true;
                showBubble();
            });

            btn.addEventListener('mouseleave', () => {
                hover = false;
                if (!pinned) hideBubble();
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                pinned = !pinned;
                if (pinned) showBubble();
                else if (!hover) hideBubble();
            });

            document.addEventListener('click', (e) => {
                if (e.target === btn) return;
                if (pinned) {
                    pinned = false;
                    if (!hover) hideBubble();
                }
            });

            window.addEventListener('scroll', () => {
                if (bubble.style.display === 'block') positionBubble();
            }, true);

            window.addEventListener('resize', () => {
                if (bubble.style.display === 'block') positionBubble();
            });

            return btn;
        };

        const setHelpButtonPlacement = (btn, wrapper, headerDiv, collapsed) => {
            if (!btn || !wrapper || !headerDiv) return;
            if (collapsed) {
                if (btn.parentNode !== headerDiv) headerDiv.appendChild(btn);
                btn.style.position = 'absolute';
                btn.style.right = '0';
                btn.style.top = '50%';
                btn.style.bottom = '';
                btn.style.transform = 'translateY(-50%)';
            } else {
                if (btn.parentNode !== wrapper) wrapper.appendChild(btn);
                wrapper.style.position = 'relative';
                btn.style.position = 'absolute';
                btn.style.right = '10px';
                btn.style.bottom = '10px';
                btn.style.top = '';
                btn.style.transform = '';
            }
        };

        const getSensorId = (text) => {
            if (typeof text !== 'string') return Number.POSITIVE_INFINITY;
            const m = text.match(/PosSensor_(\d+)_/);
            return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
        };

        const getSectionRank = (key, dataset) => {
            if (key === 'SystemState') return 1;
            if (key === 'AttitudeQuaternion' || key === 'Attitude') return 2;
            if (dataset?.groupKey === 'Estimator_Info' || key === 'LocalPosition_Pos' || key === 'LocalPosition_Vel' || key === 'LocalPosition_Acc') return 3;
            if (key === 'ControlState_Thr') return 4;
            if (key === 'MotorOutput') return 5;
            if (key === 'IMU_Noise_Range' || key === 'IMU_Noise_Var' || key === 'IMU_Acc_FFT' || key === 'IMU_Spectrogram') return 6;
            if ((dataset?.groupKey && dataset.groupKey.startsWith('SensorPanel_PosSensor_')) || key.startsWith('PosSensor_')) return 7;
            if (dataset?.groupKey === 'FC_UsedSensors_Pos_Panel' || key.startsWith('FC_UsedSensors_Pos')) return 8;
            if (isDebugText(key) || isDebugText(dataset?.name)) return 9;
            return 50;
        };

        const getSectionSubRank = (key, dataset) => {
            if (key === 'LocalPosition_Pos') return 1;
            if (key === 'LocalPosition_Vel') return 2;
            if (key === 'LocalPosition_Acc') return 3;
            if (key === 'IMU_Noise_Range') return 1;
            if (key === 'IMU_Noise_Var') return 2;
            if (key === 'IMU_Acc_FFT') return 3;
            if (key === 'IMU_Spectrogram') return 4;

            if ((dataset?.groupKey && dataset.groupKey.startsWith('SensorPanel_PosSensor_')) || key.startsWith('PosSensor_')) {
                const inspectRank = key.includes('_vs_Est_') ? 2 : 1;
                return inspectRank;
            }
            return 0;
        };

        const compareDatasetEntries = (a, b) => {
            const [keyA, dsA] = a;
            const [keyB, dsB] = b;

            const rankA = getSectionRank(keyA, dsA);
            const rankB = getSectionRank(keyB, dsB);
            if (rankA !== rankB) return rankA - rankB;

            if (rankA === 7) {
                const idA = getSensorId(dsA?.groupKey || keyA);
                const idB = getSensorId(dsB?.groupKey || keyB);
                if (idA !== idB) return idA - idB;
            }

            const subA = getSectionSubRank(keyA, dsA);
            const subB = getSectionSubRank(keyB, dsB);
            if (subA !== subB) return subA - subB;

            return keyA.localeCompare(keyB);
        };

        let firstSensorPanelWrapper = null;
        let trajectoryWrapper = null;

        const comparisonGroups = new Map();
        const ensureComparisonGroup = (groupKey, groupName) => {
            if (comparisonGroups.has(groupKey)) return comparisonGroups.get(groupKey);

            const groupWrapper = document.createElement('div');
            groupWrapper.className = 'chart-wrapper';

            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'center';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '10px';
            headerDiv.style.position = 'relative';
            headerDiv.style.position = 'relative';
            headerDiv.style.position = 'relative';

            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.style.justifyContent = 'center';
            left.style.width = '100%';
            left.style.position = 'relative';
            const btnCollapse = document.createElement('button');
            btnCollapse.innerText = '▼';
            btnCollapse.className = 'btn-tool btn-collapse';
            btnCollapse.style.position = 'absolute';
            btnCollapse.style.left = '0';
            btnCollapse.style.marginRight = '0';
            btnCollapse.title = tr('Collapse/Expand sensor XYZ comparison charts', 'Collapse/Expand sensor XYZ comparison charts');
            left.appendChild(btnCollapse);

            const title = document.createElement('span');
            title.innerText = trComposite(groupName);
            title.style.fontWeight = 'bold';
            title.style.textAlign = 'center';
            left.appendChild(title);
            headerDiv.appendChild(left);
            groupWrapper.appendChild(headerDiv);

            const body = document.createElement('div');
            body.style.transition = 'height 0.3s ease, opacity 0.3s ease';
            groupWrapper.appendChild(body);

            const groupHelpBtn = createHelpButton(
                () => trComposite(groupName),
                () => getHelpTextByContext({ kind: 'group', groupKey, groupName })
            );
            setHelpButtonPlacement(groupHelpBtn, groupWrapper, headerDiv, false);

            let collapsed = false;
            let hasSubgroups = false;

            const updateGroupHelpVisibility = () => {
                if (hasSubgroups && !collapsed) {
                    groupHelpBtn.style.display = 'none';
                    return;
                }
                groupHelpBtn.style.display = '';
                setHelpButtonPlacement(groupHelpBtn, groupWrapper, headerDiv, collapsed);
            };

            btnCollapse.addEventListener('click', () => {
                collapsed = !collapsed;
                if (collapsed) {
                    btnCollapse.innerText = '▶';
                    body.style.height = '0px';
                    body.style.overflow = 'hidden';
                    body.style.opacity = '0';
                    left.style.justifyContent = 'flex-start';
                    title.style.textAlign = 'left';
                    title.style.paddingLeft = '44px';
                } else {
                    btnCollapse.innerText = '▼';
                    body.style.height = '';
                    body.style.overflow = '';
                    body.style.opacity = '1';
                    left.style.justifyContent = 'center';
                    title.style.textAlign = 'center';
                    title.style.paddingLeft = '0';
                }
                updateGroupHelpVisibility();
            });

            updateGroupHelpVisibility();

            if (shouldDefaultCollapseGroup(groupKey, groupName)) {
                btnCollapse.click();
            }

            chartsContainer.appendChild(groupWrapper);
            if (!firstSensorPanelWrapper && typeof groupKey === 'string' && groupKey.startsWith('SensorPanel_PosSensor_')) {
                firstSensorPanelWrapper = groupWrapper;
            }
            const info = {
                body,
                subgroups: new Map(),
                markHasSubgroups: () => {
                    hasSubgroups = true;
                    updateGroupHelpVisibility();
                }
            };
            comparisonGroups.set(groupKey, info);
            return info;
        };

        const ensureComparisonSubgroup = (groupInfo, subgroupKey, subgroupName) => {
            if (groupInfo.subgroups.has(subgroupKey)) return groupInfo.subgroups.get(subgroupKey);

            if (typeof groupInfo.markHasSubgroups === 'function') {
                groupInfo.markHasSubgroups();
            }

            const subWrapper = document.createElement('div');
            subWrapper.style.marginBottom = '10px';

            const subHeader = document.createElement('div');
            subHeader.style.display = 'flex';
            subHeader.style.alignItems = 'center';
            subHeader.style.justifyContent = 'center';
            subHeader.style.margin = '4px 0 8px 0';
            subHeader.style.width = '100%';
            subHeader.style.position = 'relative';

            const subBtn = document.createElement('button');
            subBtn.innerText = '▼';
            subBtn.className = 'btn-tool btn-collapse';
            subBtn.style.position = 'absolute';
            subBtn.style.left = '0';
            subBtn.style.marginRight = '0';
            subBtn.title = tr('Collapse/Expand subgroup', 'Collapse/Expand subgroup');
            subHeader.appendChild(subBtn);

            const subTitle = document.createElement('span');
            subTitle.innerText = tr(subgroupName || subgroupKey, subgroupName || subgroupKey);
            subTitle.style.fontWeight = 'bold';
            subTitle.style.textAlign = 'center';
            subHeader.appendChild(subTitle);

            subWrapper.appendChild(subHeader);

            const subBody = document.createElement('div');
            subBody.style.transition = 'height 0.3s ease, opacity 0.3s ease';
            subWrapper.appendChild(subBody);

            const subgroupHelpBtn = createHelpButton(
                () => tr(subgroupName || subgroupKey, subgroupName || subgroupKey),
                () => getHelpTextByContext({ kind: 'subgroup', subgroupKey, subgroupName })
            );
            setHelpButtonPlacement(subgroupHelpBtn, subWrapper, subHeader, false);

            let subCollapsed = false;
            subBtn.addEventListener('click', () => {
                subCollapsed = !subCollapsed;
                if (subCollapsed) {
                    subBtn.innerText = '▶';
                    subBody.style.height = '0px';
                    subBody.style.overflow = 'hidden';
                    subBody.style.opacity = '0';
                    subHeader.style.justifyContent = 'flex-start';
                    subTitle.style.textAlign = 'left';
                    subTitle.style.paddingLeft = '44px';
                } else {
                    subBtn.innerText = '▼';
                    subBody.style.height = '';
                    subBody.style.overflow = '';
                    subBody.style.opacity = '1';
                    subHeader.style.justifyContent = 'center';
                    subTitle.style.textAlign = 'center';
                    subTitle.style.paddingLeft = '0';
                }
                setHelpButtonPlacement(subgroupHelpBtn, subWrapper, subHeader, subCollapsed);
            });

            if (shouldDefaultCollapseSubgroup(subgroupKey, subgroupName)) {
                subBtn.click();
            }

            groupInfo.body.appendChild(subWrapper);
            const subInfo = { body: subBody };
            groupInfo.subgroups.set(subgroupKey, subInfo);
            return subInfo;
        };

        const sortedEntries = Object.entries(data.datasets).sort(compareDatasetEntries);
        for (const [key, dataset] of sortedEntries) {
            if (key === 'IMU_Spectrogram') continue;
            if (!dataset.data.Time || dataset.data.Time.length === 0) continue;

            if (key === 'LocalPosition_Pos' && dataset.data.PosX && dataset.data.PosY) {
                trajSource = dataset;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'chart-wrapper';
            
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'center';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '10px';
            headerDiv.style.position = 'relative';

            const leftToolVals = document.createElement('div');
            leftToolVals.style.display = 'flex';
            leftToolVals.style.alignItems = 'center';
            leftToolVals.style.justifyContent = 'center';
            leftToolVals.style.width = '100%';
            leftToolVals.style.position = 'relative';
            
            const btnCollapse = document.createElement('button');
            btnCollapse.innerText = '▼';
            btnCollapse.className = 'btn-tool btn-collapse';
            btnCollapse.style.position = 'absolute';
            btnCollapse.style.left = '0';
            btnCollapse.style.marginRight = '0';
            btnCollapse.title = tr('Collapse/Expand chart', 'Collapse/Expand chart');
            if (dataset.groupKey) btnCollapse.style.display = 'none';
            leftToolVals.appendChild(btnCollapse);

            const headerTitle = document.createElement('span');
            headerTitle.innerText = getDisplayChartTitle(key, dataset);
            headerTitle.style.fontWeight = 'bold';
            headerTitle.style.textAlign = 'center';
            headerTitle.style.display = 'inline'; 
            leftToolVals.appendChild(headerTitle);

            headerDiv.appendChild(leftToolVals);

            const toolbar = document.createElement('div');
            toolbar.style.display = 'flex';
            toolbar.style.gap = '8px';
            toolbar.style.position = 'absolute';
            toolbar.style.right = '0';
            toolbar.style.top = '50%';
            toolbar.style.transform = 'translateY(-50%)';

            const btnReset = document.createElement('button');
            btnReset.innerText = tr('Reset Zoom', 'Reset Zoom');
            btnReset.className = 'btn-tool';
            toolbar.appendChild(btnReset);

            const btnSave = document.createElement('button');
            btnSave.innerText = tr('Save Image', 'Save Image');
            btnSave.className = 'btn-tool';
            toolbar.appendChild(btnSave);

            headerDiv.appendChild(toolbar);
            wrapper.appendChild(headerDiv);

            const chartDiv = document.createElement('div');
            chartDiv.className = 'pending-chart'; 
            chartDiv.style.minHeight = '400px'; 
            chartDiv.style.transition = 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease';
            wrapper.appendChild(chartDiv);

            let chartHelpBtn = null;
            if (!dataset.groupKey) {
                chartHelpBtn = createHelpButton(
                    () => getDisplayChartTitle(key, dataset),
                    () => getHelpTextByContext({ kind: 'chart', key, dataset })
                );
                setHelpButtonPlacement(chartHelpBtn, wrapper, headerDiv, false);
            }

            if (dataset.groupKey) {
                const group = ensureComparisonGroup(dataset.groupKey, dataset.groupName || dataset.groupKey);
                if (dataset.subgroupKey) {
                    const subgroup = ensureComparisonSubgroup(group, dataset.subgroupKey, dataset.subgroupName || dataset.subgroupKey);
                    subgroup.body.appendChild(wrapper);
                } else {
                    group.body.appendChild(wrapper);
                }
            } else {
                chartsContainer.appendChild(wrapper);
            }

            let isCollapsed = false;
            btnCollapse.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                if (isCollapsed) {
                    btnCollapse.innerText = '▶';
                    chartDiv.style.height = '0px';
                    chartDiv.style.minHeight = '0px';
                    chartDiv.style.overflow = 'hidden';
                    chartDiv.style.opacity = '0';
                    leftToolVals.style.justifyContent = 'flex-start';
                    headerTitle.style.textAlign = 'left';
                    headerTitle.style.paddingLeft = '44px';
                    btnReset.style.display = 'none';
                    btnSave.style.display = 'none';
                } else {
                    btnCollapse.innerText = '▼';
                    chartDiv.style.height = ''; 
                    chartDiv.style.minHeight = '400px';
                    chartDiv.style.overflow = '';
                    chartDiv.style.opacity = '1';
                    leftToolVals.style.justifyContent = 'center';
                    headerTitle.style.textAlign = 'center';
                    headerTitle.style.paddingLeft = '0';
                    btnReset.style.display = '';
                    btnSave.style.display = '';
                }
                if (chartHelpBtn) {
                    setHelpButtonPlacement(chartHelpBtn, wrapper, headerDiv, isCollapsed);
                }
            });

            if (btnCollapse.style.display !== 'none' && shouldDefaultCollapseChart(key, dataset)) {
                btnCollapse.click();
            }

            chartDiv._initChart = () => {
                const keys = dataset.fieldNames || Object.keys(dataset.data);
                const seriesKeys = keys.filter(k => k !== 'Time');
                
                if (seriesKeys.length === 0) return;

                const plotData = [ dataset.data.Time ];
                const seriesOpts = [ { label: dataset.xAxisLabel || "Time" } ];
                
                const len = dataset.data.Time.length;

                let dataConsistent = true;
                for (let i = 0; i < seriesKeys.length; i++) {
                    const fieldName = seriesKeys[i];
                    const arr = dataset.data[fieldName];
                    if (arr.length !== len) {
                        dataConsistent = false;
                        break;
                    }

                    if (key === 'MotorOutput') {
                        let allInvalid = true;
                        if (arr[0] > 10000 && arr[len-1] > 10000) {
                            allInvalid = true;
                            for (let j = 0; j < len; j += 100) {
                                if (arr[j] <= 10000) {
                                    allInvalid = false;
                                    break;
                                }
                            }
                        } else {
                            allInvalid = false;
                        }
                        if (allInvalid) continue;
                    }

                    plotData.push(arr);
                    seriesOpts.push({
                        label: fieldName,
                        stroke: palette[i % palette.length],
                        width: 1,
                        scale: 'y',
                        paths: uPlot.paths.stepped({ align: 1 })
                    });
                }

                if (!dataConsistent) return;
                if (plotData.length <= 1) {
                    chartDiv.innerHTML = `<p style="text-align:center;color:#999">${tr('No valid data', 'No valid data')}</p>`;
                    return;
                }

                const getChartWidth = () => {
                   return chartDiv.clientWidth > 0 ? chartDiv.clientWidth : Math.min(window.innerWidth - 40, 1100);
                };

                const opts = {
                    width: getChartWidth(),
                    height: 400,
                    cursor: { drag: { x: false, y: false }, points: { show: false } },
                    scales: {
                         x: { time: false, title: dataset.xAxisLabel || "Time (s)" }, 
                         y: { auto: true } 
                    },
                    series: seriesOpts
                };

                const u = new uPlot(opts, plotData, chartDiv);
                
                const resizeObserver = new ResizeObserver(entries => {
                    for (let entry of entries) {
                         const newWidth = entry.contentRect.width;
                         if (newWidth > 0 && Math.abs(newWidth - u.width) > 10) {
                              u.setSize({ width: newWidth, height: 400 });
                         }
                    }
                });
                resizeObserver.observe(chartDiv);

                btnReset.addEventListener('click', () => { u.setData(u.data, true); });

                btnSave.addEventListener('click', () => {
                    const originalCanvas = u.ctx.canvas;
                    const dpr = window.devicePixelRatio || 1;
                    const titleHeight = 50 * dpr;
                    const exportTitle = getExportChartTitle(key, dataset);
                    const newCanvas = document.createElement('canvas');
                    newCanvas.width = originalCanvas.width;
                    newCanvas.height = originalCanvas.height + titleHeight;
                    const ctx = newCanvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
                    ctx.fillStyle = '#000000';
                    ctx.font = `bold ${24 * dpr}px Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(exportTitle, newCanvas.width / 2, titleHeight / 2);
                    ctx.drawImage(originalCanvas, 0, titleHeight);
                    const url = newCanvas.toDataURL('image/png');
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${dataset.name}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });

                let isPanning = false;
                let panStartX = 0;
                let panStartMin = 0;
                let panStartMax = 0;

                const onPanMove = (e) => {
                    if (!isPanning) return;
                    const rect = u.over.getBoundingClientRect();
                    const cx = e.clientX - rect.left;
                    const xRange = panStartMax - panStartMin;
                    if (rect.width <= 0 || xRange === 0) return;
                    const valAtStart = u.posToVal(panStartX, "x");
                    const valAtNow = u.posToVal(cx, "x");
                    const shift = valAtStart - valAtNow;
                    let newMin = panStartMin + shift;
                    let newMax = panStartMax + shift;
                    const timeArr = plotData[0];
                    if (timeArr && timeArr.length > 0) {
                        const minTime = timeArr[0];
                        const maxTime = timeArr[timeArr.length - 1];
                        const totalDuration = maxTime - minTime;
                        if (xRange >= totalDuration) {
                            newMin = minTime;
                            newMax = maxTime;
                        } else {
                            if (newMin < minTime) { newMin = minTime; newMax = newMin + xRange; }
                            if (newMax > maxTime) { newMax = maxTime; newMin = newMax - xRange; }
                        }
                    }
                    u.setScale("x", { min: newMin, max: newMax });
                };

                const endPan = () => {
                    if (!isPanning) return;
                    isPanning = false;
                    window.removeEventListener("mousemove", onPanMove);
                    window.removeEventListener("mouseup", endPan);
                };

                u.over.addEventListener("mousedown", (e) => {
                    if (e.button !== 0) return; 
                    e.preventDefault();
                    const rect = u.over.getBoundingClientRect();
                    const cx = e.clientX - rect.left;
                    if (cx < 0 || cx > rect.width) return;
                    const scaleX = u.scales.x;
                    isPanning = true;
                    panStartX = cx;
                    panStartMin = scaleX.min;
                    panStartMax = scaleX.max;
                    window.addEventListener("mousemove", onPanMove);
                    window.addEventListener("mouseup", endPan);
                });
                u.over.addEventListener("mouseleave", endPan);

                chartDiv.addEventListener("wheel", e => {
                    e.preventDefault();
                    const rect = u.over.getBoundingClientRect();
                    const cx = e.clientX - rect.left; 
                    if (cx < 0 || cx > rect.width) return;
                    const scaleX = u.scales.x;
                    const xVal = u.posToVal(cx, "x");
                    const xRange = scaleX.max - scaleX.min;
                    const xMin = scaleX.min;
                    const isZoomIn = e.deltaY < 0;
                    const factor = isZoomIn ? 0.9 : 1.1; 
                    const newRange = xRange * factor;
                    const ratio = xRange === 0 ? 0 : (xVal - xMin) / xRange;
                    let newMin = xVal - (ratio * newRange);
                    let newMax = newMin + newRange;
                    const timeArr = plotData[0];
                    if (timeArr && timeArr.length > 0) {
                        const minTime = timeArr[0];
                        const maxTime = timeArr[timeArr.length - 1];
                        const totalDuration = maxTime - minTime;
                        if (newRange >= totalDuration) {
                            newMin = minTime;
                            newMax = maxTime;
                        } else {
                            if (newMin < minTime) { newMin = minTime; newMax = newMin + newRange; }
                            if (newMax > maxTime) { newMax = maxTime; newMin = newMax - newRange; if(newMin < minTime) newMin = minTime;}
                        }
                    }
                    u.batch(() => { u.setScale("x", { min: newMin, max: newMax }); });
                });
            };

            chartObserver.observe(chartDiv);
        }

        if (trajSource && trajSource.data.PosX.length === trajSource.data.PosY.length && trajSource.data.PosX.length > 0) {
            const wrapper = document.createElement('div');
            wrapper.className = 'chart-wrapper';
            
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'center';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '10px';
            headerDiv.style.position = 'relative';

            const leftToolVals = document.createElement('div');
            leftToolVals.style.display = 'flex';
            leftToolVals.style.alignItems = 'center';
            leftToolVals.style.justifyContent = 'center';
            leftToolVals.style.width = '100%';
            leftToolVals.style.position = 'relative';
            const btnCollapse = document.createElement('button');
            btnCollapse.innerText = '▼';
            btnCollapse.className = 'btn-tool btn-collapse';
            btnCollapse.style.position = 'absolute';
            btnCollapse.style.left = '0';
            btnCollapse.style.marginRight = '0';
            btnCollapse.title = tr('Collapse/Expand chart', 'Collapse/Expand chart');
            leftToolVals.appendChild(btnCollapse);

            const headerTitle = document.createElement('span');
            headerTitle.innerText = getChartName('FlightTrajectory_3D', 'FlightTrajectory_3D');
            headerTitle.style.fontWeight = 'bold';
            headerTitle.style.display = 'inline'; 
            leftToolVals.appendChild(headerTitle);

            headerDiv.appendChild(leftToolVals);
            wrapper.appendChild(headerDiv);

            const chartDiv = document.createElement('div');
            chartDiv.style.width = '100%';
            chartDiv.style.height = '600px';
            chartDiv.style.transition = 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease';
            wrapper.appendChild(chartDiv);
            chartsContainer.appendChild(wrapper);
            trajectoryWrapper = wrapper;

            const trajHelpBtn = createHelpButton(
                () => getChartName('FlightTrajectory_3D', 'FlightTrajectory_3D'),
                () => getHelpTextByContext({ kind: 'chart', key: 'FlightTrajectory_3D', dataset: null })
            );
            setHelpButtonPlacement(trajHelpBtn, wrapper, headerDiv, false);

            let isCollapsed = false;
            btnCollapse.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                if (isCollapsed) {
                    btnCollapse.innerText = '▶';
                    chartDiv.style.height = '0px';
                    chartDiv.style.minHeight = '0px';
                    chartDiv.style.overflow = 'hidden';
                    chartDiv.style.opacity = '0';
                    leftToolVals.style.justifyContent = 'flex-start';
                    headerTitle.style.textAlign = 'left';
                    headerTitle.style.paddingLeft = '44px';
                } else {
                    btnCollapse.innerText = '▼';
                    chartDiv.style.height = '600px'; 
                    chartDiv.style.minHeight = '';
                    chartDiv.style.overflow = '';
                    chartDiv.style.opacity = '1';
                    leftToolVals.style.justifyContent = 'center';
                    headerTitle.style.textAlign = 'center';
                    headerTitle.style.paddingLeft = '0';
                }
                setHelpButtonPlacement(trajHelpBtn, wrapper, headerDiv, isCollapsed);
            });

            const timeArr = trajSource.data.Time;
            const posY = trajSource.data.PosY;
            const posX = trajSource.data.PosX;
            const posZ = trajSource.data.PosZ || [];
            
            const totalPoints = timeArr.length;
            const MAX_3D_POINTS = 50000;
            const step = Math.ceil(totalPoints / MAX_3D_POINTS); 
            
            const segments = [];
            let currentSeg = { x: [], y: [], z: [] };
            const GAP_THRESHOLD = 1.0; 

            for (let i = 0; i < totalPoints; i += step) {
                if (i > 0) {
                    const prevI = i - step >= 0 ? i - step : i - 1;
                    const dt = timeArr[i] - timeArr[prevI];
                    if (dt > GAP_THRESHOLD * Math.max(1, step * 0.5)) { 
                        if (currentSeg.x.length > 0) segments.push(currentSeg);
                        currentSeg = { x: [], y: [], z: [] };
                    }
                }
                currentSeg.x.push(-posY[i]);
                currentSeg.y.push(posX[i]);
                currentSeg.z.push(posZ.length > i ? -posZ[i] : 0);
            }
            if (currentSeg.x.length > 0) segments.push(currentSeg);

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            
            segments.forEach(seg => {
                seg.x.forEach(v => {
                    if (v < minX) minX = v;
                    if (v > maxX) maxX = v;
                });
                seg.y.forEach(v => {
                    if (v < minY) minY = v;
                    if (v > maxY) maxY = v;
                });
                seg.z.forEach(v => {
                    if (v < minZ) minZ = v;
                    if (v > maxZ) maxZ = v;
                });
            });
            
            if (minX === Infinity) { minX = -1; maxX = 1; }
            if (minY === Infinity) { minY = -1; maxY = 1; }
            if (minZ === Infinity) { minZ = -1; maxZ = 1; }

            const segColors = [
                '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', 
                '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
            ];

            const traces = [];

            segments.forEach((seg, idx) => {
                const color = segColors[idx % segColors.length];
                const groupName = `group_${idx}`;
                const segmentName = `Segment ${idx + 1}`;

                traces.push({
                    x: seg.x,
                    y: seg.y,
                    z: seg.z,
                    mode: 'lines',
                    type: 'scatter3d',
                    line: { width: 4, color: color },
                    name: segmentName,
                    legendgroup: groupName,
                    showlegend: true,
                    hoverinfo: 'x+y+z+name'
                });

                if (seg.x.length > 0) {
                    traces.push({
                        x: [seg.x[0]],
                        y: [seg.y[0]],
                        z: [seg.z[0]],
                        mode: 'markers',
                        type: 'scatter3d',
                        marker: { size: 5, color: '#00cc00', symbol: 'circle' },
                        name: `${segmentName} Start`,
                        legendgroup: groupName,
                        showlegend: false,
                        hoverinfo: 'x+y+z+name'
                    });

                    const last = seg.x.length - 1;
                    traces.push({
                        x: [seg.x[last]],
                        y: [seg.y[last]],
                        z: [seg.z[last]],
                        mode: 'markers',
                        type: 'scatter3d',
                        marker: { size: 5, color: '#cc0000', symbol: 'circle' },
                        name: `${segmentName} End`,
                        legendgroup: groupName,
                        showlegend: false,
                        hoverinfo: 'x+y+z+name'
                    });
                }
            });

            const layout = {
                margin: { l: 0, r: 0, b: 0, t: 40 },
                showlegend: segments.length > 1, 
                scene: {
                    xaxis: { title: 'X' },
                    yaxis: { title: 'Y' },
                    zaxis: { title: 'Z' },
                    aspectmode: 'data'
                }
            };
            Plotly.newPlot(chartDiv, traces, layout, { displaylogo: false, responsive: true });
        }

        if (data.datasets['IMU_Spectrogram']) {
            const specData = data.datasets['IMU_Spectrogram'];
            
            const wrapper = document.createElement('div');
            wrapper.className = 'chart-wrapper';
            
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'center';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '10px';

            const leftToolVals = document.createElement('div');
            leftToolVals.style.display = 'flex';
            leftToolVals.style.alignItems = 'center';
            leftToolVals.style.justifyContent = 'center';
            leftToolVals.style.width = '100%';
            leftToolVals.style.position = 'relative';
            const btnCollapse = document.createElement('button');
            btnCollapse.innerText = '▼';
            btnCollapse.className = 'btn-tool btn-collapse';
            btnCollapse.style.position = 'absolute';
            btnCollapse.style.left = '0';
            btnCollapse.style.marginRight = '0';
            leftToolVals.appendChild(btnCollapse);

            const headerTitle = document.createElement('span');
            const tMap = (typeof ChartTranslations !== 'undefined') ? ChartTranslations : {};
            const translatedName = tMap['IMU_Spectrogram'] || specData.name;
            headerTitle.innerText = translatedName;
            
            headerTitle.style.fontWeight = 'bold';
            headerTitle.style.display = 'inline'; 
            leftToolVals.appendChild(headerTitle);

            headerDiv.appendChild(leftToolVals);
            wrapper.appendChild(headerDiv);

            const chartDiv = document.createElement('div');
            chartDiv.style.width = '100%';
            chartDiv.style.height = '500px'; 
            chartDiv.style.transition = 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease';
            wrapper.appendChild(chartDiv);
            if (firstSensorPanelWrapper && firstSensorPanelWrapper.parentNode === chartsContainer) {
                chartsContainer.insertBefore(wrapper, firstSensorPanelWrapper);
            } else if (trajectoryWrapper && trajectoryWrapper.parentNode === chartsContainer) {
                chartsContainer.insertBefore(wrapper, trajectoryWrapper);
            } else {
                chartsContainer.appendChild(wrapper);
            }

            const specHelpBtn = createHelpButton(
                () => translatedName,
                () => getHelpTextByContext({ kind: 'chart', key: 'IMU_Spectrogram', dataset: specData })
            );
            setHelpButtonPlacement(specHelpBtn, wrapper, headerDiv, false);

            let isCollapsed = false;
            btnCollapse.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                if (isCollapsed) {
                    btnCollapse.innerText = '▶';
                    chartDiv.style.height = '0px';
                    chartDiv.style.minHeight = '0px';
                    chartDiv.style.overflow = 'hidden';
                    chartDiv.style.opacity = '0';
                    leftToolVals.style.justifyContent = 'flex-start';
                    headerTitle.style.textAlign = 'left';
                    headerTitle.style.paddingLeft = '44px';
                } else {
                    btnCollapse.innerText = '▼';
                    chartDiv.style.height = '500px'; 
                    chartDiv.style.minHeight = '';
                    chartDiv.style.overflow = '';
                    chartDiv.style.opacity = '1';
                    leftToolVals.style.justifyContent = 'center';
                    headerTitle.style.textAlign = 'center';
                    headerTitle.style.paddingLeft = '0';
                    if (chartDiv.layout) Plotly.relayout(chartDiv, { 'xaxis.autorange': true, 'yaxis.autorange': true });
                }
                setHelpButtonPlacement(specHelpBtn, wrapper, headerDiv, isCollapsed);
            });

            // Optimize: Pre-render heatmap to multiple image canvases (Slicing Strategy)
            // 解决超长日志导致 Canvas 宽度溢出（崩溃/黑屏）的问题
            // 将整个频谱图切分为多个宽度适中（如 4096px）的小图片并排显示
            const rawWidth = specData.data.x.length;
            const rawHeight = specData.data.y.length;
            const zValues = specData.data.z; // Row: Freq, Col: Time
            
            // Dynamic Range
            const zMax = specData.maxDB || 0;
            const zMin = zMax - 60; // 60dB range

            // Helper: Jet Colormap
            function getJetColor(v) {
                let r=0, g=0, b=0;
                if (v < 0) v = 0; if (v > 1) v = 1;
                
                if (v < 0.125) { r=0; g=0; b=0.5 + 4*v; } // 0..0.5
                else if (v < 0.375) { r=0; g=4*(v-0.125); b=1; }
                else if (v < 0.625) { r=4*(v-0.375); g=1; b=1 - 4*(v-0.375); }
                else if (v < 0.875) { r=1; g=1 - 4*(v-0.625); b=0; }
                else { r=1 - 4*(v-0.875); g=0; b=0; } // 0.5..0
                
                return [Math.floor(r*255), Math.floor(g*255), Math.floor(b*255)];
            }

            // Calculate DT (Time per pixel)
            const xAll = specData.data.x;
            const dt = (rawWidth > 1) ? (xAll[rawWidth-1] - xAll[0]) / (rawWidth - 1) : 1;

            const MAX_SLICE_WIDTH = 4096; // 限制每个 Canvas 的最大宽度
            const imagesList = [];

            const yTop = specData.data.y[rawHeight - 1]; // Max Freq
            const yHeight = yTop - specData.data.y[0];   // Freq Range

            for (let startCol = 0; startCol < rawWidth; startCol += MAX_SLICE_WIDTH) {
                const sliceWidth = Math.min(MAX_SLICE_WIDTH, rawWidth - startCol);
                
                // Create Slice Canvas
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = sliceWidth;
                sliceCanvas.height = rawHeight;
                const sliceCtx = sliceCanvas.getContext('2d');
                const imgData = sliceCtx.createImageData(sliceWidth, rawHeight);

                // Fill Pixels
                for (let f = 0; f < rawHeight; f++) {
                    const imgRow = rawHeight - 1 - f; // Flip Y (Canvas 0 is Top)
                    const rowData = zValues[f];
                    
                    for (let t = 0; t < sliceWidth; t++) {
                        const globalT = startCol + t;
                        const db = rowData[globalT];
                         
                        const norm = (db - zMin) / (zMax - zMin);
                        const [r, g, b] = getJetColor(norm);
                        
                        const idx = (imgRow * sliceWidth + t) * 4;
                        imgData.data[idx] = r;
                        imgData.data[idx+1] = g;
                        imgData.data[idx+2] = b;
                        imgData.data[idx+3] = 255;
                    }
                }
                sliceCtx.putImageData(imgData, 0, 0);

                // Add to Plotly Images
                const xPos = xAll[startCol];
                const endIdx = startCol + sliceWidth - 1;
                let duration = xAll[endIdx] - xPos;
                if (duration <= 0) duration = sliceWidth * dt;

                imagesList.push({
                    source: sliceCanvas.toDataURL(),
                    xref: 'x',
                    yref: 'y',
                    x: xPos,
                    y: yTop,
                    sizex: duration,
                    sizey: yHeight,
                    sizing: 'stretch',
                    layer: 'below'
                });
            }

            // Setup Axes Range
            const xStart = xAll[0];
            const xEnd = xAll[rawWidth - 1];
            const yStart = specData.data.y[0];
            const yEnd = yTop;

            // Use a dummy trace for Colorbar
            const dummyTrace = {
                x: [xStart, xEnd],
                y: [yStart, yEnd],
                z: [[zMin, zMin], [zMax, zMax]], 
                type: 'heatmap',
                colorscale: 'Jet',
                showscale: true,
                colorbar: { title: 'Log Power (dB)' },
                opacity: 0, 
                hoverinfo: 'none'
            };

            const layout = {
                margin: { l: 60, r: 20, b: 50, t: 40 },
                xaxis: { 
                    title: 'Time (s)', 
                    range: [xStart, xEnd],
                    constrain: 'domain'
                },
                yaxis: { 
                    title: 'Frequency (Hz)',
                    range: [yStart, yEnd],
                },
                dragmode: 'pan',
                // Pass all slices
                images: imagesList
            };

            Plotly.newPlot(chartDiv, [dummyTrace], layout, { displaylogo: false, responsive: true, scrollZoom: true })
                .then(() => {
                    const imgs = chartDiv.querySelectorAll('image');
                    imgs.forEach((img) => {
                        img.style.imageRendering = 'pixelated';
                        img.setAttribute('image-rendering', 'pixelated');
                        img.setAttribute('shape-rendering', 'crispEdges');
                    });

                    // Clamp pan/zoom to data bounds (same behavior as other charts)
                    const clampRange = (min, max, lo, hi) => {
                        let span = max - min;
                        const full = hi - lo;
                        if (span <= 0) return { min: lo, max: hi };
                        if (span >= full) return { min: lo, max: hi };
                        if (min < lo) { min = lo; max = lo + span; }
                        if (max > hi) { max = hi; min = hi - span; }
                        return { min, max };
                    };

                    let isClamping = false;
                    const clampAxes = (evt) => {
                        if (isClamping || !evt) return;
                        const xr0 = evt['xaxis.range[0]'];
                        const xr1 = evt['xaxis.range[1]'];
                        const yr0 = evt['yaxis.range[0]'];
                        const yr1 = evt['yaxis.range[1]'];

                        const updates = {};

                        if (typeof xr0 === 'number' && typeof xr1 === 'number') {
                            const clamped = clampRange(xr0, xr1, xStart, xEnd);
                            if (clamped.min !== xr0 || clamped.max !== xr1) {
                                updates['xaxis.range'] = [clamped.min, clamped.max];
                            }
                        }

                        if (typeof yr0 === 'number' && typeof yr1 === 'number') {
                            const clamped = clampRange(yr0, yr1, yStart, yEnd);
                            if (clamped.min !== yr0 || clamped.max !== yr1) {
                                updates['yaxis.range'] = [clamped.min, clamped.max];
                            }
                        }

                        if (Object.keys(updates).length > 0) {
                            isClamping = true;
                            Plotly.relayout(chartDiv, updates).then(() => { isClamping = false; });
                        }
                    };

                    chartDiv.on('plotly_relayouting', clampAxes);
                    chartDiv.on('plotly_relayout', clampAxes);
                });
        }
    }
});