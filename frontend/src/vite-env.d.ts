/// <reference types="vite/client" />

// 浏览器语音识别 API 类型
interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
  