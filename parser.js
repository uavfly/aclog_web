// 字段类型操作映射
const FT = {
    U8: 'getUint8',
    I8: 'getInt8',
    U16: 'getUint16',
    I16: 'getInt16',
    U32: 'getUint32',
    I32: 'getInt32',
    F32: 'getFloat32',
    F64: 'getFloat64',
};

// 辅助函数：读取字符串
function readString(view, offset, maxLen) {
    let str = "";
    for (let i = 0; i < maxLen; i++) {
        const code = view.getUint8(offset + i);
        if (code === 0) break;
        str += String.fromCharCode(code);
    }
    return str;
}

// 动态扩容的 Float64Array，用于高性能存储
class DynamicSeries {
    constructor(initialCapacity = 10000) {
        this.data = new Float64Array(initialCapacity);
        this.length = 0;
    }

    push(val) {
        if (this.length >= this.data.length) {
            // 扩容 1.5 倍
            const newCap = Math.ceil(this.data.length * 1.5);
            const newArr = new Float64Array(newCap);
            newArr.set(this.data);
            this.data = newArr;
        }
        this.data[this.length++] = val;
    }

    // 获取最终的有效数组视图 (不复制内存)
    getArray() {
        return this.data.subarray(0, this.length);
    }
}

// 消息定义与解析逻辑
const MessageDefs = {
    1: { 
        name: "SystemState",
        parse: (view, offset, LE) => {
            // flags(2)+Time(4)+cpu(1)+rc(1)+bat%(1)+batId(1)+volt(4)+cur(4)+rc[8*4](32)+temp(1)+mode(1)+rsv(6)
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            const vals = {
                Time: time,
                Flags: view.getUint16(offset, LE),
                CPULoad: view.getUint8(offset + 6),
                BatPct: view.getUint8(offset + 8),
                Voltage: view.getFloat32(offset + 10, LE),
                Current: view.getFloat32(offset + 14, LE),
                Temp: view.getInt8(offset + 50),
                Mode: view.getUint8(offset + 51)
            };
            // RC Channels in SystemState
            const rcStart = offset + 18;
            vals.RC_Roll = view.getFloat32(rcStart, LE);
            vals.RC_Pitch = view.getFloat32(rcStart + 4, LE);
            vals.RC_Yaw = view.getFloat32(rcStart + 8, LE);
            vals.RC_Thr = view.getFloat32(rcStart + 12, LE);
            return { group: "SystemState", values: vals };
        }
    },
    27: {
        name: "IMU",
        parse: (view, offset, LE) => {
            const type = view.getUint8(offset);
            const ind = view.getUint8(offset + 1);
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            
            const types = ["Unknown", "Accel", "Gyro", "Mag", "DualAnt"];
            const tName = types[type] || "Type"+type;

            const vals = {
                Time: time,
                X: view.getFloat32(offset + 18, LE),
                Y: view.getFloat32(offset + 22, LE),
                Z: view.getFloat32(offset + 26, LE),
                Rate: view.getFloat32(offset + 30, LE),
                Temp: view.getFloat32(offset + 34, LE)
            };
            return { group: `IMU_${tName}_${ind}`, values: vals };
        }
    },
    28: {
        name: "PosSensor",
        parse: (view, offset, LE, length) => {
            const sensorType = view.getUint8(offset);
            const dataType = view.getUint8(offset + 1);
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            const sensorByte = view.getUint8(offset + 6);
            const ind = sensorByte & 0x7F; 
            
            const vals = { Time: time };
            let suffix = "";
            const payloadLen = length - 2; 
            
            if (payloadLen === 38) { 
                 if (dataType < 8) { 
                     vals.PosX = view.getFloat64(offset + 14, LE);
                     vals.PosY = view.getFloat64(offset + 22, LE);
                     vals.PosZ = view.getFloat64(offset + 30, LE);
                     suffix = "Pos";
                 } else { 
                     vals.VelX = view.getFloat64(offset + 14, LE);
                     vals.VelY = view.getFloat64(offset + 22, LE);
                     vals.VelZ = view.getFloat64(offset + 30, LE);
                     suffix = "Vel";
                 }
            } else if (payloadLen === 62) { 
                 vals.PosX = view.getFloat64(offset + 14, LE);
                 vals.PosY = view.getFloat64(offset + 22, LE);
                 vals.PosZ = view.getFloat64(offset + 30, LE);
                 vals.VelX = view.getFloat64(offset + 38, LE);
                 vals.VelY = view.getFloat64(offset + 46, LE);
                 vals.VelZ = view.getFloat64(offset + 54, LE);
                 suffix = "PosVel";
            } else if (payloadLen === 70) { 
                 vals.PosX = view.getFloat64(offset + 46, LE);
                 vals.PosY = view.getFloat64(offset + 54, LE);
                 vals.PosZ = view.getFloat64(offset + 62, LE);
                 suffix = "GPS_Pos";
            } else if (payloadLen === 94) { 
                 vals.PosX = view.getFloat64(offset + 46, LE);
                 vals.PosY = view.getFloat64(offset + 54, LE);
                 vals.PosZ = view.getFloat64(offset + 62, LE);
                 vals.VelX = view.getFloat64(offset + 70, LE);
                 vals.VelY = view.getFloat64(offset + 78, LE);
                 vals.VelZ = view.getFloat64(offset + 86, LE);
                 suffix = "GPS_PosVel";
            }
            return { group: `PosSensor_${ind}_${suffix}`, values: vals };
        }
    },
    30: {
        name: "Attitude",
        parse: (view, offset, LE) => {
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            const rad2deg = 57.2957795;
            return {
                group: "Attitude",
                values: {
                    Time: time,
                    Roll: view.getFloat64(offset + 6, LE) * rad2deg,
                    Pitch: view.getFloat64(offset + 14, LE) * rad2deg,
                    Yaw: view.getFloat64(offset + 22, LE) * rad2deg,
                    RollRate: view.getFloat64(offset + 30, LE) * rad2deg,
                    PitchRate: view.getFloat64(offset + 38, LE) * rad2deg,
                    YawRate: view.getFloat64(offset + 46, LE) * rad2deg
                }
            };
        }
    },
    31: {
        name: "AttitudeQuaternion",
        parse: (view, offset, LE) => {
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            const q0 = view.getFloat64(offset + 6, LE);
            const q1 = view.getFloat64(offset + 14, LE);
            const q2 = view.getFloat64(offset + 22, LE);
            const q3 = view.getFloat64(offset + 30, LE);
            const rad2deg = 57.2957795;

            const sinr_cosp = 2 * (q0 * q1 + q2 * q3);
            const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
            const roll = Math.atan2(sinr_cosp, cosr_cosp);
            const sinp = 2 * (q0 * q2 - q3 * q1);
            const pitch = Math.abs(sinp) >= 1 ? (Math.PI / 2) * Math.sign(sinp) : Math.asin(sinp);
            const siny_cosp = 2 * (q0 * q3 + q1 * q2);
            const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
            const yaw = Math.atan2(siny_cosp, cosy_cosp);

            return {
                group: "AttitudeQuaternion",
                values: {
                    Time: time,
                    Q0: q0, Q1: q1, Q2: q2, Q3: q3,
                    Roll: roll * rad2deg,
                    Pitch: pitch * rad2deg,
                    Yaw: yaw * rad2deg,
                    RollRate: view.getFloat64(offset + 38, LE) * rad2deg,
                    PitchRate: view.getFloat64(offset + 46, LE) * rad2deg,
                    YawRate: view.getFloat64(offset + 54, LE) * rad2deg
                }
            };
        }
    },
    32: {
        name: "LocalPositionNED",
        parse: (view, offset, LE) => {
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            // Return array to split into multiple charts
            return [
                {
                    group: "LocalPosition_Pos",
                    values: {
                        Time: time,
                        XYSensor: view.getInt8(offset + 0),
                        ZSensor: view.getInt8(offset + 1),
                        PosX: view.getFloat64(offset + 6, LE),
                        PosY: view.getFloat64(offset + 14, LE),
                        PosZ: view.getFloat64(offset + 22, LE)
                    }
                },
                {
                    group: "LocalPosition_Vel",
                    values: {
                        Time: time,
                        VelX: view.getFloat64(offset + 30, LE),
                        VelY: view.getFloat64(offset + 38, LE),
                        VelZ: view.getFloat64(offset + 46, LE)
                    }
                },
                {
                    group: "LocalPosition_Acc",
                    values: {
                        Time: time,
                        AccX: view.getFloat64(offset + 54, LE),
                        AccY: view.getFloat64(offset + 62, LE),
                        AccZ: view.getFloat64(offset + 70, LE)
                    }
                }
            ];
        }
    },
    250: {
        name: "DebugVect",
        parse: (view, offset, LE, length) => {
            const time = view.getUint32(offset + 2, LE) * 0.0001;
            const name = readString(view, offset + 6, 10);
            
            const vals = { Time: time };
            
            const dataLen = (length - 2) - 16;
            const doubleCount = Math.floor(dataLen / 8);
            const dataStart = offset + 16;

            if (name === "dianji") {
                for (let i = 0; i < 8 && i < doubleCount; i++) {
                    vals[`Motor${i+1}`] = view.getFloat64(dataStart + i*8, LE);
                }
                return { group: "MotorOutput", values: vals };
            } else if (name === "lingP") {
                for (let i = 0; i < doubleCount; i++) {
                    vals[`Bias${i}`] = view.getFloat64(dataStart + i*8, LE);
                }
                return { group: "Bias", values: vals };
            } else if (name === "thr") {
                if (doubleCount >= 5) {
                    vals.Throttle = view.getFloat64(dataStart, LE);
                    vals.HoverThr = view.getFloat64(dataStart + 8, LE);
                    vals.Force = view.getFloat64(dataStart + 16, LE);
                    vals.TgtAccZ = view.getFloat64(dataStart + 24, LE);
                    vals.EsoAccZ = view.getFloat64(dataStart + 32, LE);
                }
                return { group: "ControlState_Thr", values: vals };
            } else if (name.startsWith("ESC")) {
                // 尝试匹配标准 ESCnStaX 格式
                const escIdMatch = name.match(/^ESC(\d+)Sta(\d)$/);
                
                if (escIdMatch) {
                    const escId = escIdMatch[1];
                    const type = escIdMatch[2];
                    
                    if (type === '1') {
                        vals.RPM = view.getFloat64(dataStart, LE);
                        vals.PWM = view.getFloat64(dataStart + 8, LE);
                        vals.Status = view.getFloat64(dataStart + 16, LE);
                    } else if (type === '2') {
                        vals.Voltage = view.getFloat64(dataStart, LE);
                        vals.Current = view.getFloat64(dataStart + 8, LE);
                        vals.Temp = view.getFloat64(dataStart + 16, LE);
                    } else if (type === '3') {
                        vals.MosTemp = view.getFloat64(dataStart, LE);
                        vals.CapTemp = view.getFloat64(dataStart + 8, LE);
                        vals.MotorTemp = view.getFloat64(dataStart + 16, LE);
                    } else {
                         // 已知格式但未知类型的，作为通用处理
                         for (let i = 0; i < doubleCount; i++) {
                            vals[`V${i}`] = view.getFloat64(dataStart + i*8, LE);
                        }
                    }
                    return { group: `ESC_${escId}_Msg${type}`, values: vals };
                } else {
                     // 虽然以 ESC 开头但不符合 ESCnStaX 格式，作为普通 DebugVect 处理
                     for (let i = 0; i < doubleCount; i++) {
                        vals[`V${i}`] = view.getFloat64(dataStart + i*8, LE);
                    }
                    return { group: `Debug_${name}`, values: vals };
                }
            } else {
                for (let i = 0; i < doubleCount; i++) {
                    vals[`V${i}`] = view.getFloat64(dataStart + i*8, LE);
                }
                return { group: `Debug_${name}`, values: vals };
            }
        }
    }
};

class ACLoreParser {
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.view = new DataView(arrayBuffer);
        this.offset = 0;
        this.fileSize = arrayBuffer.byteLength;
    }

    parseHeader() {
        if (this.fileSize < 28) return null;
        const m1 = this.view.getUint8(0);
        const m2 = this.view.getUint8(1);
        if (m1 !== 65 || m2 !== 67) return null;

        const descriptionBytes = new Uint8Array(this.buffer, 4, 24);
        let descStr = "";
        for (let i = 0; i < 24; i++) {
            if (descriptionBytes[i] === 0) break;
            descStr += String.fromCharCode(descriptionBytes[i]);
        }
        this.offset = 28;
        return {
            magic: "AC",
            verMain: this.view.getUint8(2),
            verSub: this.view.getUint8(3),
            description: descStr
        };
    }

    startParse() {
        this.header = this.parseHeader();
        if (!this.header) throw new Error("无效的日志文件头");

        this.datasets = {};
        this.stats = { totalFrames: 0, unknownFrames: 0, frameCounts: {} };
        this.loopSafety = 0;
    }

    // 执行一小步解析，返回进度 (0~1)
    // 如果完成，返回 1.0
    parseStep(maxBytesOrMs = 1000000) {
        const len = this.fileSize;
        const LE = true;
        const startOffset = this.offset;
        
        while (this.offset + 4 < len) {
            // Check step limit
            if (this.offset - startOffset > maxBytesOrMs) {
                return this.offset / len;
            }

            if (++this.loopSafety > 20000000) throw new Error("解析循环溢出 (20M frames)");

            const m1 = this.view.getUint8(this.offset);
            const m2 = this.view.getUint8(this.offset + 1);

            if (m1 !== 65 || m2 !== 67) { 
                this.offset++;
                continue;
            }

            const msgType = this.view.getUint8(this.offset + 2);
            const length = this.view.getUint8(this.offset + 3);

            if (this.offset + 2 + length > len) break;

            this.stats.totalFrames++;
            this.stats.frameCounts[msgType] = (this.stats.frameCounts[msgType] || 0) + 1;

            const def = MessageDefs[msgType];
            if (def) {
                const payloadStart = this.offset + 4;
                const result = def.parse(this.view, payloadStart, LE, length);

                if (result) {
                    const results = Array.isArray(result) ? result : [result];

                    for (const res of results) {
                        const groupKey = res.group;
                        const vals = res.values;

                        if (!this.datasets[groupKey]) {
                            this.datasets[groupKey] = {
                                name: groupKey,
                                data: {} // 此时 data 存储的是 key -> DynamicSeries
                            };
                        }
                        const ds = this.datasets[groupKey];
                        
                        for (const k in vals) {
                            if (!ds.data[k]) ds.data[k] = new DynamicSeries();
                            ds.data[k].push(vals[k]);
                        }
                    }
                }
            } else {
                this.stats.unknownFrames++;
            }

            this.offset += 2 + length;
        }

        return 1.0; // Complete
    }

    getResult() {
        // 将 DynamicSeries 转换为 TypedArray 视图
        const finalDatasets = {};
        for (const [key, ds] of Object.entries(this.datasets)) {
            finalDatasets[key] = {
                name: ds.name,
                data: {}
            };
            for (const [field, series] of Object.entries(ds.data)) {
                finalDatasets[key].data[field] = series.getArray();
            }
        }
        return { header: this.header, stats: this.stats, datasets: finalDatasets };
    }

    parseAll() {
        this.startParse();
        this.parseStep(Number.MAX_SAFE_INTEGER);
        return this.getResult();
    }
}