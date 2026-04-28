#!/usr/bin/env bash

# 终端性能压力测试脚本
# 用途：观察终端在长时间、大量输出时的性能和资源占用
# 用法：./terminal_stress_test.sh [延迟秒数] [模式]

DELAY=${1:-0.05}
MODE=${2:-"mixed"}

echo "=========================================="
echo "          终端性能压力测试已启动          "
echo "=========================================="
echo "当前延迟: ${DELAY} 秒 每行"
echo "测试模式: ${MODE} (可选: mixed, long, color, fast)"
echo "按 Ctrl+C 停止测试。"
echo "=========================================="

sleep 1

lines=0

# fast 模式覆盖延迟
if [[ "$MODE" == "fast" ]]; then
    DELAY="0"
fi

while true; do
    lines=$((lines+1))
    timestamp=$(date +'%Y-%m-%d %H:%M:%S.%3N')
    
    case "$MODE" in
        "long")
            # 生成超长字符串以测试换行和排版性能
            long_string=$(head -c 300 /dev/urandom | base64 | tr -d '\n' 2>/dev/null)
            echo -e "[$timestamp] [行 $lines] 巨型数据载荷: $long_string"
            ;;
        "color")
            # 输出大量 ANSI 颜色和样式（粗体、斜体、背景色），测试渲染引擎
            c1=$((31 + RANDOM % 7))
            bg=$((41 + RANDOM % 7))
            c2=$((91 + RANDOM % 7))
            echo -e "[$timestamp] \e[1;${c1}m[行号 $lines]\e[0m \e[3;${bg}m 测试背景与斜体混合渲染 \e[0m \e[1;4;${c2}m下划线高亮文本\e[0m - 随机探针值: $RANDOM"
            ;;
        *)
            # mixed 默认模式，模拟真实高并发日志输出
            color=$((31 + RANDOM % 7))
            rand_str=$(head -c 24 /dev/urandom | base64 | tr -d '\n' 2>/dev/null)
            echo -e "\e[${color}m[$timestamp] [INFO] [Thread-$((1 + RANDOM % 16))] 处理数据块 $lines (耗时: 0.$((RANDOM % 99))ms): $rand_str\e[0m"
            ;;
    esac

    if [[ "$DELAY" != "0" ]]; then
        sleep "$DELAY" 2>/dev/null || true
    fi
done
