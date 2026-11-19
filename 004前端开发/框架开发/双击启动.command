#!/bin/sh
# 双击启动账号服务并打开登录页。等价于在终端里 cd 到本目录再 npm start。
# 需要 MySQL 已运行（daily_ledger 库），否则这里会直接报连不上数据库。
cd "$(dirname "$0")" || exit 1

( sleep 2; open "http://127.0.0.1:3000/pages/auth.html" ) &
exec npm start
