const ChartTranslations = {
    // 基础消息
    "SystemState": "系统状态",
    "Attitude": "姿态角",
    "AttitudeQuaternion": "姿态四元数",

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
