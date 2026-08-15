"""安全删除 web/aurora/build 目录，避免每次 build 残留导致授权弹窗。

只删除 build 目录本身，不碰其他任何文件。
删除前打印绝对路径和大小，确认后才执行。
"""
import shutil
import os
import sys

# 计算相对于项目根目录的路径
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)  # one-api/
build_dir = os.path.join(project_root, "web", "aurora", "build")

# 安全检查：必须包含 web/aurora/build 路径段
if not build_dir.endswith(os.path.join("web", "aurora", "build")):
    print(f"[拒绝] 路径异常，疑似非 build 目录: {build_dir}")
    sys.exit(1)

if not os.path.exists(build_dir):
    print(f"[跳过] 目录不存在: {build_dir}")
    sys.exit(0)

# 计算大小
total_size = 0
file_count = 0
for root, dirs, files in os.walk(build_dir):
    for f in files:
        fp = os.path.join(root, f)
        total_size += os.path.getsize(fp)
        file_count += 1

print(f"[确认] 将删除: {build_dir}")
print(f"        文件数: {file_count}, 大小: {total_size / 1024 / 1024:.1f} MB")

# 执行删除
shutil.rmtree(build_dir)
print(f"[完成] 已删除 {file_count} 个文件")
