#!/bin/bash
set -e
cd "$(dirname "$0")/框架开发"

if ! curl --silent --fail --output /dev/null http://127.0.0.1:3100/; then
  nohup npm start > /tmp/daily-ledger-admin.log 2>&1 &
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl --silent --fail --output /dev/null http://127.0.0.1:3100/; then break; fi
    sleep 1
  done
fi

if curl --silent --fail --output /dev/null http://127.0.0.1:3100/; then
  open http://127.0.0.1:3100/
else
  echo "后台启动失败，请查看 /tmp/daily-ledger-admin.log"
  read -r -p "按回车关闭窗口"
  exit 1
fi
