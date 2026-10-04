@echo off
title Kho 30

:: 1. Chay Web Server
cd /d "C:\Users\Administrator\Downloads\TEST"
start "" /b cmd /c npm start

:: 2. Cho 3 giay
ping 127.0.0.1 -n 4 >nul

:: 3. Chay Zalo Bot
cd /d "C:\Users\Administrator\Downloads\TEST\zalo-bot"
start "" /b cmd /c npm start

exit
