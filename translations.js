const ChartTranslations = {
    // 基础消息
    "SystemState": "系统状态",
    "Attitude": "姿态角",
    "AttitudeQuaternion": "姿态信息",

    // 消息类型名称 (用于统计信息)
    "IMU": "惯性传感器",
    "PosSensor": "位置传感器",
    "DebugVect": "调试数据",
    "LocalPositionNED": "解算数据",

    "MotorOutput": "电机输出",
    "Bias": "传感器零偏",
    "ControlState_Thr": "油门控制状态",
    // 本地位置估计
    "LocalPosition_Pos": "解算位置",
    "LocalPosition_Vel": "解算速度",
    "LocalPosition_Acc": "解算加速度",

    // UI 通用文案 (English key -> Chinese)
    "Your IP": "您的 IP",
    "Please upload a .aclog file": "请上传 .aclog 格式的日志文件",
    "Reading file...": "正在读取文件...",
    "Parsing data...": "正在解析数据...",
    "Parse Error": "解析出错",
    "Header Parse Failed": "头解析失败",
    "Parse Step Error": "解析过程出错",
    "Description": "描述",
    "Version": "版本",
    "File Date": "文件日期",
    "Total Frames": "总帧数",
    "Unknown/Ignored Frames": "未解析/忽略帧数",
    "Frame Type Statistics": "帧类型统计",
    "Sensor Overview": "传感器总览",
    "No position/velocity sensors detected": "未检测到位置/速度传感器",
    "No valid data": "无有效数据",
    "Reset Zoom": "重置缩放",
    "Save Image": "保存图片",
    "Collapse/Expand chart": "折叠/展开图表",
    "Collapse/Expand subgroup": "折叠/展开该分组",
    "Collapse/Expand sensor XYZ comparison charts": "折叠/展开该传感器XYZ对比图",

    // 传感器分类
    "Horizontal Position Sensor": "水平位置传感器",
    "Horizontal Velocity Sensor": "水平速度传感器",
    "Horizontal Position+Velocity Sensor": "水平位置速度传感器",
    "Altitude Sensor": "高度传感器",
    "3D Position Sensor": "三维位置传感器",
    "3D Position+Velocity Sensor": "三维位置速度传感器",
    "3D Velocity Sensor": "三维速度传感器",
    "Unclassified Sensor": "未分类传感器",

    // 分组/标题
    "Estimator Info": "解算信息",
    "Estimator Position": "解算位置",
    "Estimator Velocity": "解算速度",
    "Estimator Acceleration": "解算加速度",
    "Realtime Used Sensor Position (XYSensor/ZSensor)": "飞控实时使用传感器位置 (XYSensor/ZSensor)",
    "Realtime Used Sensor Position": "飞控实时使用传感器位置",
    "Realtime Used Sensor Data": "实时使用传感器数据",
    "Sensor Data": "传感器数据",
    "Inspect": "检查",
    "Pos Inspect": "位置检查",
    "Vel Inspect": "速度检查",
    "Sensor PosX vs Estimator Position PosX": "传感器PosX值与解算位置PosX对比",
    "Sensor PosY vs Estimator Position PosY": "传感器PosY值与解算位置PosY对比",
    "Sensor PosZ vs Estimator Position PosZ": "传感器PosZ值与解算位置PosZ对比",
    "Sensor VelX vs Estimator Velocity VelX": "传感器VelX值与解算速度VelX对比",
    "Sensor VelY vs Estimator Velocity VelY": "传感器VelY值与解算速度VelY对比",
    "Sensor VelZ vs Estimator Velocity VelZ": "传感器VelZ值与解算速度VelZ对比",
    "Show help": "显示帮助",
    "Chart": "图表",
    "Help content: mouse wheel to zoom, drag to pan, and use collapse button to fold/unfold.": "帮助信息：滚轮缩放，拖拽平移，使用折叠按钮展开/收起。",
    "Help Estimator Info": "解算位置、速度、加速度信息。",
    "Help Sensor Group": "包含传感器的原始数据与对比检查图，可用于评估单传感器稳定性及与解算结果的一致性。",
    "Help FC Used Sensor Group": "飞控实时选用的传感器数据及其与解算结果的对比，用于验证传感器切换与融合效果。",
    "Help Debug Group": "调试诊断信号。",
    "Help Generic Group": "这是一个帮助信息。（废话）",
    "Help Pos Inspect Subgroup": "按轴展示“传感器位置”与“解算位置”对比，建议重点关注偏差幅值、持续时间与突变时刻。",
    "Help Vel Inspect Subgroup": "按轴展示“传感器速度”与“解算速度”对比，建议重点关注动态段误差与稳态段噪声水平。",
    "Help Inspect Subgroup": "用于检查传感器与解算结果的一致性，可结合误差曲线定位异常来源。",
    "Help Generic Subgroup": "这是一个帮助信息。（废话）",
    "Help SystemState": "系统状态时间序列，包含关键模式与状态标志，适用于事件定位与状态切换核查。",
    "Help Attitude": "姿态信息时间序列，适用于分析姿态连续性、机动过程响应及异常跳变。",
    "Help LocalPosition_Pos": "解算位置时间序列，用于评估位置估计稳定性与轨迹连续性。",
    "Help LocalPosition_Vel": "解算速度时间序列，用于评估速度估计平滑性与动态响应。",
    "Help LocalPosition_Acc": "解算加速度时间序列，用于评估高频噪声水平与机动响应特征。",
    "Help ControlState_Thr": "油门控制状态时间序列，可用于分析推力控制过程与阶段性限制。",
    "Help MotorOutput": "电机输出/指令通道时间序列，可用于检查饱和、失衡及执行一致性。",
    "Help IMU_Noise_Range": "0.1s 窗口加速度极差（峰峰值）指标。<br/>数据质量判读建议：<br/>1) 常态飞行阶段若曲线整体较低且平稳，通常表示振动控制良好。<br/>2) 若出现持续高平台或密集尖峰，提示结构振动、安装松动或工况激励偏强。",
    "Help IMU_Noise_Var": "0.1s 窗口加速度方差指标。<br/>数据质量判读建议：<br/>1) 方差在稳态段低且连续，通常表示噪声水平可控。<br/>2) 方差在特定转速/姿态段显著抬升，常见于共振或气动扰动增强。<br/>3) 若三轴同时宽频抬升，需重点排查机械振源与减振状态。",
    "Help IMU_Acc_FFT": "加速度频域幅值图，用于识别主导振动频率。<br/>数据质量判读建议：<br/>1) 主峰集中且与已知机械频率对应，通常可解释性较好。<br/>2) 若高频段整体抬升或峰值过多且分散，提示宽带噪声偏高。<br/>3) 建议结合电机转速、桨频与结构模态进行频率归因。",
    "Help IMU_Spectrogram": "加速度时频功率图，用于观察振动随时间演化。<br/>数据质量判读建议：<br/>1) 红色带处于低频段且持续，通常表示稳定的机械振动。<br/>2) 若红色带在特定时间段显著抬升，提示瞬态激励或共振现象。<br/>3) 红色带处于高频段且持续，说明飞机可能存在宽带噪声问题，需重点排查振动源与减振措施。",
    "Help FlightTrajectory_3D": "基于解算位置重建的三维飞行轨迹，可用于空间路径复核与异常段回溯。",
    "Help FC_UsedSensors_Pos": "飞控实时选用传感器位置值（XYSensor/ZSensor），用于验证传感器选择逻辑与数据连续性。",
    "Help Inspect Chart": "传感器与解算对比图，建议重点关注偏差趋势、动态段响应差异及异常突变。",
    "Help Debug Chart": "调试诊断图，建议结合固件语义、参数快照与飞行工况进行联合分析。",
    "Help Generic Chart": "支持滚轮缩放、拖拽平移；可结合重置/保存功能进行快速复核与留档。",

    /* // 传感器 - IMU
    "IMU_Accel_0": "加速度计 0 (Accel_0)",
    "IMU_Accel_1": "加速度计 1 (Accel_1)",
    "IMU_Accel_2": "加速度计 2 (Accel_2)",
    "IMU_Gyro_0": "陀螺仪 0 (Gyro_0)",
    "IMU_Gyro_1": "陀螺仪 1 (Gyro_1)",
    "IMU_Gyro_2": "陀螺仪 2 (Gyro_2)",
    "IMU_Mag_0": "磁罗盘 0 (Mag_0)",
    "IMU_Mag_1": "磁罗盘 1 (Mag_1)",
    "IMU_DualAnt_0": "双天线航向 0 (DualAnt_0)", */

    /* // 传感器 - 位置/GPS
    "PosSensor_0_Pos": "位置传感器 0-位置 (PosSensor_0_Pos)",
    "PosSensor_0_Vel": "位置传感器 0-速度 (PosSensor_0_Vel)",
    "PosSensor_0_PosVel": "位置传感器 0-位速 (PosSensor_0_PosVel)",
    "PosSensor_0_GPS_Pos": "GPS 0-位置 (GPS_0_Pos)",
    "PosSensor_0_GPS_PosVel": "GPS 0-位速 (GPS_0_PosVel)",
    // 假设可能有 PosSensor_1...
    "PosSensor_1_Pos": "位置传感器 1-位置 (PosSensor_1_Pos)",
    "PosSensor_1_Vel": "位置传感器 1-速度 (PosSensor_1_Vel)",
    "PosSensor_1_PosVel": "位置传感器 1-位速 (PosSensor_1_PosVel)",
    "PosSensor_1_GPS_Pos": "GPS 1-位置 (GPS_1_Pos)",
    "PosSensor_1_GPS_PosVel": "GPS 1-位速 (GPS_1_PosVel)",
    */
    // 电调反馈 (示例，根据实际情况扩展)
    "ESC_0_Msg1": "电调 0 反馈-RPM/PWM",
    "ESC_1_Msg1": "电调 1 反馈-RPM/PWM",
    "ESC_2_Msg1": "电调 2 反馈-RPM/PWM",
    "ESC_3_Msg1": "电调 3 反馈-RPM/PWM",
    "ESC_4_Msg1": "电调 4 反馈-RPM/PWM",
    
    // 分析图表
    "IMU_Noise_Range": "加速度分析-极差",
    "IMU_Noise_Var": "加速度分析-方差",
    "IMU_Spectrogram": "加速度时频分析 (STFT热力图)",
    "IMU_Acc_FFT": "加速度频谱分析",
    "FlightTrajectory_3D": "飞行轨迹"
};

// 辅助函数：尝试获取翻译，支持动态名称的部分处理
function getChartName(key, defaultName) {
    if (ChartTranslations[key]) {
        return ChartTranslations[key];
    }
    
    // 处理带频率的 FFT 标题: 
    // key 是 "IMU_Acc_FFT" (我们在 app.js 里定义 datasets key 时就叫这个)
    // 但 app.js 里把 name 属性写成了长字符串。
    // 我们在渲染时，最好优先用 key 查表。
    
    return defaultName || key;
}
