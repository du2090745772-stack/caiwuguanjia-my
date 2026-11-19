#!/bin/sh
# 双击启动账号服务并自动打开登录页，等价于在本目录执行 npm start。
# MySQL（daily_ledger 库）要先起来，否则这里会直接报连不上数据库。
cd "$(dirname "$0")" || exit 1

# npm 装在本机用户目录下时，双击进来的 shell 可能找不到它
command -v npm >/dev/null 2>&1 || PATH="$HOME/.local/bin:$PATH"
export PATH

( sleep 2; open "http://127.0.0.1:3000/pages/auth.html" ) &
npm start
