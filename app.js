document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const infoPanel = document.getElementById('file-info');
    const infoContent = document.getElementById('info-content');
    const chartsContainer = document.getElementById('charts-container');
    const loading = document.getElementById('loading');

    // 尝试获取 IP 及地理位置
    // 改用 JSONP 方式，以支持本地 file:// 协议运行时的跨域请求
    const displayIp = (ip, loc) => {
        const display = document.getElementById('cf-ip-display');
        if (display && ip) {
            // 避免重复显示
            if (display.textContent.includes(ip)) return;
            const locStr = loc ? ` - ${loc}` : '';
            display.innerText = `您的 IP: ${ip}${locStr}`;
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
            // 此时必须使用 HTTPS 接口，避免 Mixed Content 错误。
            
            // 1. 首选 ipwho.is (HTTPS, CORS支持, 中文)
            try {
                const res = await fetch('https://ipwho.is/?lang=zh-CN');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        // 过滤 undefined，组合城市和国家
                        const loc = [data.city, data.country].filter(Boolean).join(', ');
                        displayIp(data.ip, loc);
                        return;
                    }
                }
            } catch (e) { /* ignore */ }

            // 2. 尝试 Cloudflare Trace (相对路径，最快，但可能无城市信息)
            try {
                const res = await fetch('/cdn-cgi/trace');
                if (res.ok) {
                    const text = await res.text();
                    const ip = text.match(/ip=([^\n]+)/)?.[1];
                    const loc = text.match(/loc=([^\n]+)/)?.[1]; // 仅国家代码
                    if (ip) {
                        displayIp(ip, loc);
                        // 如果成功获取 IP，不再强求更详细的城市信息，以减少跳变
                        return;
                    }
                }
            } catch (e) { /* ignore */ }

            // 3. 尝试 DB-IP (HTTPS, CORS, 免费版含城市)
            try {
                const res = await fetch('https://api.db-ip.com/v2/free/self');
                if (res.ok) {
                    const data = await res.json();
                    const loc = [data.city, data.countryName].filter(Boolean).join(', ');
                    displayIp(data.ipAddress, loc);
                    return;
                }
            } catch (e) { /* ignore */ }

            // 4. 兜底: Ipify (HTTPS, 仅 IP)
            try {
                const res = await fetch('https://api.ipify.org?format=json');
                if (res.ok) {
                    const data = await res.json();
                    displayIp(data.ip, '');
                }
            } catch (e) { console.warn('All HTTPS GeoIP failed'); }

        } else {
            // --- 策略 B: 本地 file:// 或 HTTP 环境 ---
            // 此时 Fetch 可能会被 CORS 拦截，使用 JSONP 更稳妥。
            // 使用 http://ip-api.com，内容丰富且支持 JSONP
            fetchJsonp('http://ip-api.com/json/?lang=zh-CN')
                .then(data => {
                    if (data.status === 'success') {
                        displayIp(data.query, [data.city, data.country].filter(Boolean).join(', '));
                    } else {
                        throw new Error('ip-api Error');
                    }
                })
                .catch(() => {
                    // 备用: Ipify JSONP
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
            alert('请上传 .aclog 格式的日志文件');
            return;
        }

        // UI Reset
        chartsContainer.classList.add('hidden');
        infoPanel.classList.add('hidden');
        loading.classList.remove('hidden');
        chartsContainer.innerHTML = ''; // 清空之前生成的图表

        // 重置进度条
        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');
        if (progressBar) progressBar.style.width = '0%';
        if (progressBar) progressBar.innerText = '0%';
        if (loadingText) loadingText.innerText = '正在读取文件...';

        const reader = new FileReader();
        
        // 显示读取进度
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 50); // 读取占前 50%
                if (progressBar) progressBar.style.width = percent + '%';
                if (progressBar) progressBar.innerText = percent + '%';
            }
        };

        reader.onload = (e) => {
             if (loadingText) loadingText.innerText = '正在解析数据...';
             // 开始分步解析
             setTimeout(() => {
                try {
                    analyzeDataAsync(e.target.result, file);
                } catch (err) {
                     console.error(err);
                     alert('解析出错: ' + err.message);
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
            alert('头解析失败: ' + e.message);
            loading.classList.add('hidden');
            return;
        }

        const CHUNK_SIZE = 500000; // 每次处理 500KB 字节
        
        function step() {
            try {
                const progress = parser.parseStep(CHUNK_SIZE);
                
                // 将解析进度映射到 50%~100%
                const totalPercent = Math.floor(50 + progress * 50);
                if (progressBar) {
                    progressBar.style.width = totalPercent + '%';
                    progressBar.innerText = totalPercent + '%';
                }

                if (progress < 1.0) {
                    // 继续
                    requestAnimationFrame(step);
                } else {
                    // 完成
                    const data = parser.getResult();
                    calculateNoise(data);
                    calculateFFT(data);
                    displayInfo(data.header, data.stats, file);
                    renderCharts(data);
                    
                    loading.classList.add('hidden');
                    infoPanel.classList.remove('hidden');
                    chartsContainer.classList.remove('hidden');
                }
            } catch (err) {
                 console.error(err);
                 alert('解析过程出错: ' + err.message);
                 loading.classList.add('hidden');
            }
        }

        requestAnimationFrame(step);
    }

    // 已不再使用旧的 analyzeData（同步版），可保留作为参考或删除
    function displayInfo(header, stats, file) {
        let countsStr = '';
        for (const [type, count] of Object.entries(stats.frameCounts)) {
            let name = 'Unknown';
            // 反向查找名称
            if (typeof MessageDefs !== 'undefined' && MessageDefs[type]) {
                const rawName = MessageDefs[type].name;
                // 尝试翻译名称
                name = (typeof getChartName === 'function') ? getChartName(rawName, rawName) : rawName;
            }
            countsStr += `<li>${name} (${type}): ${count}</li>`;
        }

        const dateStr = file && file.lastModified ? new Date(file.lastModified).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unknown';
        
        infoContent.innerHTML = `
            <p><strong>描述:</strong> ${header.description}</p>
            <p><strong>版本:</strong> ${header.verMain}.${header.verSub}</p>
            <p><strong>文件日期:</strong> ${dateStr}</p>
            <p><strong>总帧数:</strong> ${stats.totalFrames}</p>
            <p><strong>未解析/忽略帧数:</strong> ${stats.unknownFrames}</p>
            <p><strong>帧类型统计:</strong></p>
            <ul>${countsStr}</ul>
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
        // Range arrays
        const rangeX = new Float64Array(len);
        const rangeY = new Float64Array(len);
        const rangeZ = new Float64Array(len);
        
        const windowSize = 0.1; // 0.1 seconds
        
        // Helper to compute Range (Max - Min) for specific array
        function computeRange(input, output) {
             let left = 0;
             
             for (let right = 0; right < len; right++) {
                 // Slide window
                 while (time[right] - time[left] > windowSize) {
                     left++;
                 }
                 
                 // Find min/max in current window [left, right]
                 // Since window is small (0.1s), simple loop is efficient enough
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

        // Variance arrays
        const varX = new Float64Array(len);
        const varY = new Float64Array(len);
        const varZ = new Float64Array(len);

        // Helper to compute var for specific array
        function computeVar(input, output) {
             let left = 0;
             let sum = 0;
             let sumSq = 0;
             
             for (let right = 0; right < len; right++) {
                 const val = input[right];
                 sum += val;
                 sumSq += val * val;
                 
                 // Slide window
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

        // 1. Estimate Sample Rate
        const duration = time[time.length - 1] - time[0];
        const count = time.length;
        if (duration <= 0) return;
        const avgFs = (count - 1) / duration;
        
        // 2. Setup FFT params
        const fftSize = 4096; // 4096 points for better resolution
        if (count < fftSize) return; // Not enough data
        
        // Setup Hanning Window
        const window = new Float64Array(fftSize);
        for(let i=0; i<fftSize; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
        }

        // Iterative Radix-2 FFT
        function fftIterations(re, im) {
            const n = re.length;
            const levels = Math.log2(n);
            
            // Bit reversal
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
            
            // Butterfly
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
        
        // Welch Method
        const hopSize = fftSize / 2;
        const numSegments = Math.floor((count - fftSize) / hopSize) + 1;
        
        const finalData = {};

        for (const [key, signal] of Object.entries(accDataMap)) {
            if (!signal) continue;
            
            const avgSpec = new Float64Array(fftSize / 2);
            const re = new Float64Array(fftSize);
            const im = new Float64Array(fftSize);
            
            // Compute average scale factor for window
            // For Hanning window, coherent gain is 0.5. To recover amplitude, divide by N/2.
            
            let segmentsProcessed = 0;
            
            for (let i = 0; i < numSegments; i++) {
                const start = i * hopSize;
                
                // Copy and window
                for(let j=0; j<fftSize; j++) {
                    re[j] = signal[start + j] * window[j];
                    im[j] = 0;
                }
                
                fftIterations(re, im);
                
                // Accumulate magnitude
                for(let j=0; j<fftSize/2; j++) {
                    // Magnitude = sqrt(re^2 + im^2) * 2 / N (for one-sided spectrum, excluding DC) based on window scaling
                    // Normalization is tricky.
                    // Simple: abs(fft) / N
                    // Current window sum = N/2. 
                    // Let's use standard magnitude: sqrt(re^2+im^2)
                    // We will normalize at the end.
                    const mag = Math.sqrt(re[j]*re[j] + im[j]*im[j]);
                    avgSpec[j] += mag;
                }
                segmentsProcessed++;
            }
            
            // Normalize
            // 2/N factor for one-sided, plus 2 for Hanning window loss = 4/N?
            // Empirical: For sin wave amp A, indices peak at A * N / 2. Hanning reduces by half -> A * N / 4. 
            // So we multiply by 4/N.
            const norm = 4.0 / fftSize / segmentsProcessed;
            
            for(let j=0; j<fftSize/2; j++) {
                avgSpec[j] *= norm;
            }
            // Fix DC
            avgSpec[0] = 0; 

            finalData['FFT_' + key] = avgSpec;
        }

        // Generate Frequency Axis
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
                Time: freqs, // Reuse Time field for X-axis
                ...finalData
            }
        };
    }

    function renderCharts(data) {
        chartsContainer.innerHTML = ''; // 清空现有图表

        const palette = [
            "#f44336", "#2196f3", "#4caf50", "#ff9800", "#9c27b0", 
            "#3f51b5", "#00bcd4", "#795548", "#607d8b", "#e91e63"
        ];

        let trajSource = null;

        // 懒加载观察器
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

        for (const [key, dataset] of Object.entries(data.datasets)) {
            if (!dataset.data.Time || dataset.data.Time.length === 0) continue;

            if (key === 'LocalPosition_Pos' && dataset.data.PosX && dataset.data.PosY) {
                trajSource = dataset;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'chart-wrapper';
            
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '10px';

            const leftToolVals = document.createElement('div');
            
            const btnCollapse = document.createElement('button');
            btnCollapse.innerText = '▼';
            btnCollapse.className = 'btn-tool btn-collapse';
            btnCollapse.style.marginRight = '8px';
            btnCollapse.title = '折叠/展开图表';
            leftToolVals.appendChild(btnCollapse);

            // Display title next to collapse button for clarity when collapsed, 
            // even though chart has internal title.
            // When collapsed, chart title is hidden, so we need something visible.
            const headerTitle = document.createElement('span');
            headerTitle.innerText = getChartName(key, dataset.name);
            headerTitle.style.fontWeight = 'bold';
            headerTitle.style.display = 'none'; // Hidden by default, shown when collapsed
            leftToolVals.appendChild(headerTitle);

            headerDiv.appendChild(leftToolVals);

            // External title removed

            const toolbar = document.createElement('div');
            toolbar.style.display = 'flex';
            toolbar.style.gap = '8px';

            const btnReset = document.createElement('button');
            btnReset.innerText = '重置缩放';
            btnReset.className = 'btn-tool';
            toolbar.appendChild(btnReset);

            const btnSave = document.createElement('button');
            btnSave.innerText = '保存图片';
            btnSave.className = 'btn-tool';
            toolbar.appendChild(btnSave);

            headerDiv.appendChild(toolbar);
            wrapper.appendChild(headerDiv);

            const chartDiv = document.createElement('div');
            chartDiv.className = 'pending-chart'; 
            chartDiv.style.minHeight = '400px'; 
            chartDiv.style.transition = 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease';
            wrapper.appendChild(chartDiv);
            chartsContainer.appendChild(wrapper);

            let isCollapsed = false;
            btnCollapse.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                if (isCollapsed) {
                    btnCollapse.innerText = '▶';
                    chartDiv.style.height = '0px';
                    chartDiv.style.minHeight = '0px';
                    chartDiv.style.overflow = 'hidden';
                    chartDiv.style.opacity = '0';
                    headerTitle.style.display = 'inline'; // Show title when collapsed
                    // Hide other tools when collapsed to clean up
                    btnReset.style.display = 'none';
                    btnSave.style.display = 'none';
                } else {
                    btnCollapse.innerText = '▼';
                    chartDiv.style.height = ''; // Auto height (or previous height)
                    chartDiv.style.minHeight = '400px';
                    chartDiv.style.overflow = '';
                    chartDiv.style.opacity = '1';
                    headerTitle.style.display = 'none'; // Hide title (chart has internal title)
                    btnReset.style.display = '';
                    btnSave.style.display = '';
                }
            });

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
                    chartDiv.innerHTML = '<p style="text-align:center;color:#999">无有效数据</p>';
                    return;
                }

                const getChartWidth = () => {
                   return chartDiv.clientWidth > 0 ? chartDiv.clientWidth : Math.min(window.innerWidth - 40, 1100);
                };

                const opts = {
                    title: getChartName(key, dataset.name), // Restored internal title
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
                
                // Add resize listener
                const resizeObserver = new ResizeObserver(entries => {
                    for (let entry of entries) {
                         // Only resize if width changed significantly to avoid loops
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
                    ctx.fillText(dataset.name, newCanvas.width / 2, titleHeight / 2);
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
            headerDiv.style.justifyContent = 'space-between'; // Need space for left tools
            headerDiv.style.alignItems = 'center';
            headerDiv.style.marginBottom = '10px';

            const leftToolVals = document.createElement('div');
            const btnCollapse = document.createElement('button');
            btnCollapse.innerText = '▼';
            btnCollapse.className = 'btn-tool btn-collapse';
            btnCollapse.style.marginRight = '8px';
            btnCollapse.title = '折叠/展开图表';
            leftToolVals.appendChild(btnCollapse);

            const headerTitle = document.createElement('span');
            headerTitle.innerText = getChartName('FlightTrajectory_3D', 'FlightTrajectory_3D');
            headerTitle.style.fontWeight = 'bold';
            headerTitle.style.display = 'none'; 
            leftToolVals.appendChild(headerTitle);

            headerDiv.appendChild(leftToolVals);
            wrapper.appendChild(headerDiv);

            // External title removed
            const chartDiv = document.createElement('div');
            chartDiv.style.width = '100%'; // Adaptive width
            chartDiv.style.height = '600px';
            chartDiv.style.transition = 'height 0.3s ease, min-height 0.3s ease, opacity 0.3s ease';
            wrapper.appendChild(chartDiv);
            chartsContainer.appendChild(wrapper);

            let isCollapsed = false;
            btnCollapse.addEventListener('click', () => {
                isCollapsed = !isCollapsed;
                if (isCollapsed) {
                    btnCollapse.innerText = '▶';
                    chartDiv.style.height = '0px';
                    chartDiv.style.minHeight = '0px';
                    chartDiv.style.overflow = 'hidden';
                    chartDiv.style.opacity = '0';
                    headerTitle.style.display = 'inline';
                } else {
                    btnCollapse.innerText = '▼';
                    chartDiv.style.height = '600px'; 
                    chartDiv.style.minHeight = '';
                    chartDiv.style.overflow = '';
                    chartDiv.style.opacity = '1';
                    headerTitle.style.display = 'none';
                }
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
            
            // Fallback for empty data
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
                // Use default name if translation fails, but we don't have segment names in translation file currently
                const segmentName = `Segment ${idx + 1}`;

                // 1. Path Line
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
                    // 2. Start Point (Green Circle)
                    traces.push({
                        x: [seg.x[0]],
                        y: [seg.y[0]],
                        z: [seg.z[0]],
                        mode: 'markers',
                        type: 'scatter3d',
                        marker: { size: 5, color: '#00cc00', symbol: 'circle' },
                        name: `${segmentName} Start`,
                        legendgroup: groupName,
                        showlegend: false, // Linked to line
                        hoverinfo: 'x+y+z+name'
                    });

                    // 3. End Point (Red Circle)
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
                        showlegend: false, // Linked to line
                        hoverinfo: 'x+y+z+name'
                    });
                }
            });

            const layout = {
                title: `${getChartName('FlightTrajectory_3D', 'FlightTrajectory_3D')}`, // Removed Sample Rate display
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
    }
});