@echo off
title Kho 30 - Web App & Zalo Bot
cd /d "C:\Users\Administrator\Downloads\TEST"

echo ====================================================
echo    DANG KHOI CHAY HE THONG KHO 30 & ZALO BOT
echo ====================================================

:: Khoi dong Web Server Next.js
start "Web Kho 30" /min cmd /c "npm start"

:: Cho 3 giay de Web Server san sang port 3000
timeout /t 3 /nobreak >nul

:: Khoi dong Zalo Bot
cd /d "C:\Users\Administrator\Downloads\TEST\zalo-bot"
start "Zalo Bot" /min cmd /c "npm start"

exit
