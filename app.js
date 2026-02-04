document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const infoPanel = document.getElementById('file-info');
    const infoContent = document.getElementById('info-content');
    const chartsContainer = document.getElementById('charts-container');
    const loading = document.getElementById('loading');

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
                name = MessageDefs[type].name;
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

            const title = document.createElement('h3');
            title.innerText = dataset.name;
            title.style.margin = '0';
            headerDiv.appendChild(title);

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
            wrapper.appendChild(chartDiv);
            chartsContainer.appendChild(wrapper);

            chartDiv._initChart = () => {
                const keys = dataset.fieldNames || Object.keys(dataset.data);
                const seriesKeys = keys.filter(k => k !== 'Time');
                
                if (seriesKeys.length === 0) return;

                const plotData = [ dataset.data.Time ];
                const seriesOpts = [ { label: "Time" } ];
                
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

                const opts = {
                    title: dataset.name,
                    width: 1100,
                    height: 400,
                    cursor: { drag: { x: false, y: false }, points: { show: false } },
                    scales: { x: { time: false, title: "Time (s)" }, y: { auto: true } },
                    series: seriesOpts
                };

                const u = new uPlot(opts, plotData, chartDiv);

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
            const title = document.createElement('h3');
            title.innerText = 'FlightTrajectory_3D';
            wrapper.appendChild(title);
            const chartDiv = document.createElement('div');
            chartDiv.style.width = '1100px';
            chartDiv.style.height = '600px';
            wrapper.appendChild(chartDiv);
            chartsContainer.appendChild(wrapper);

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

            let maxAbsX = 1, maxAbsY = 1, maxAbsZ = 1;
            segments.forEach(seg => {
                seg.x.forEach(v => maxAbsX = Math.max(maxAbsX, Math.abs(v)));
                seg.y.forEach(v => maxAbsY = Math.max(maxAbsY, Math.abs(v)));
                seg.z.forEach(v => maxAbsZ = Math.max(maxAbsZ, Math.abs(v)));
            });

            const segColors = [
                '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', 
                '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
            ];

            const traces = segments.map((seg, idx) => ({
                x: seg.x,
                y: seg.y,
                z: seg.z,
                mode: 'lines',
                type: 'scatter3d',
                line: { width: 4, color: segColors[idx % segColors.length] },
                name: `Segment ${idx + 1}`,
                hoverinfo: 'x+y+z+name'
            }));

            const layout = {
                title: `FlightTrajectory_3D (Sample Rate: 1/${step})`,
                margin: { l: 0, r: 0, b: 0, t: 40 },
                showlegend: segments.length > 1, 
                scene: {
                    xaxis: { title: 'X', range: [-maxAbsX, maxAbsX] },
                    yaxis: { title: 'Y', range: [-maxAbsY, maxAbsY] },
                    zaxis: { title: 'Z', range: [-maxAbsZ, maxAbsZ] },
                    aspectmode: 'data'
                }
            };
            Plotly.newPlot(chartDiv, traces, layout, { displaylogo: false, responsive: true });
        }
    }
});