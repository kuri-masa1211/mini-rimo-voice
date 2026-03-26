"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Upload, Square, Settings, FileAudio, Check, AlertCircle, Loader2, Play, FileText, LayoutList } from "lucide-react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

interface GeminiModel {
  name: string;
  displayName: string;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [inputModelName, setInputModelName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [audioFile, setAudioFile] = useState<File | Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [ffmpegProgress, setFfmpegProgress] = useState<{ratio: number, text: string} | null>(null);
  const [transcription, setTranscription] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<"transcription" | "minutes">("minutes");
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    const savedModel = localStorage.getItem("gemini_model_name");
    
    if (savedKey) {
      setApiKey(savedKey);
      setInputKey(savedKey);
      if (savedModel) {
        setModelName(savedModel);
        setInputModelName(savedModel);
      }
      fetchModels(savedKey, savedModel);
    } else {
      setShowSettings(true);
    }
  }, []);

  const fetchModels = async (key: string, savedModel: string | null = null) => {
    if (!key) return;
    setIsLoadingModels(true);
    setSettingsError("");
    
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!res.ok) {
        throw new Error("無効なAPIキー、またはモデル一覧の取得に失敗しました。");
      }
      
      const data = await res.json();
      const modelsVal = data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: any) => ({
          name: m.name.replace("models/", ""), // remove 'models/' prefix
          displayName: m.displayName || m.name.replace("models/", ""),
        }));
      
      if (modelsVal.length === 0) {
        throw new Error("generateContent をサポートするモデルが見つかりません。");
      }

      setAvailableModels(modelsVal);

      // Default model selection strategy
      const flashModels = modelsVal.filter((m: GeminiModel) => m.name.toLowerCase().includes("flash"));
      const defaultModelCandidate = flashModels.length > 0 ? flashModels[0].name : modelsVal[0].name;
      
      const bestModel = (savedModel && modelsVal.some((m: GeminiModel) => m.name === savedModel)) 
        ? savedModel 
        : defaultModelCandidate;

      setInputModelName((prev) => prev ? prev : bestModel);
      
    } catch (e: unknown) {
      console.error(e);
      setSettingsError((e as Error).message || "エラーが発生しました。手動でモデル名を入力してください。");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const saveApiKey = () => {
    setApiKey(inputKey);
    setModelName(inputModelName);
    localStorage.setItem("gemini_api_key", inputKey);
    localStorage.setItem("gemini_model_name", inputModelName);
    setShowSettings(false);
  };

  const removeApiKey = () => {
    setApiKey("");
    setInputKey("");
    setModelName("");
    setInputModelName("");
    setAvailableModels([]);
    localStorage.removeItem("gemini_api_key");
    localStorage.removeItem("gemini_model_name");
  };

  const handleVerifyKey = () => {
    if (inputKey) fetchModels(inputKey);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioFile(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // chunk every second
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError("マイクへのアクセスが拒否されたか、エラーが発生しました。");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setTranscription("");
      setMinutes("");
      setError("");
    }
  };

  const clearAudio = () => {
    setAudioFile(null);
    setAudioUrl(null);
    setTranscription("");
    setMinutes("");
    setError("");
    setRecordingTime(0);
  };

  const extractAudio = async (videoFile: File | Blob): Promise<Blob> => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });
    ffmpeg.on('progress', ({ progress }) => {
      const ratio = Math.max(0, Math.min(1, progress));
      setFfmpegProgress({ 
        ratio, 
        text: `動画から音声を抽出中... ${Math.round(ratio * 100)}%` 
      });
    });

    setFfmpegProgress({ ratio: 0.05, text: "抽出エンジンの準備中..." });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    setFfmpegProgress({ ratio: 0.1, text: "録画データの読み込み中..." });
    const fileData = await fetchFile(videoFile);
    await ffmpeg.writeFile('input.mp4', fileData);
    
    setFfmpegProgress({ ratio: 0.2, text: "音声トラックを分離・抽出しています..." });
    
    // `-vn` excludes video
    // `-c:a copy` copies audio without re-encoding (extremely fast). Most MP4/Zoom use AAC audio natively.
    await ffmpeg.exec(['-i', 'input.mp4', '-vn', '-c:a', 'copy', 'output.m4a']);
    
    setFfmpegProgress({ ratio: 1.0, text: "抽出完了！AIへ送信準備中..." });
    const data = (await ffmpeg.readFile('output.m4a')) as Uint8Array;
    
    try {
      ffmpeg.terminate();
    } catch(e) {}
    
    return new Blob([data.buffer], { type: 'audio/m4a' });
  };

  const processAudio = async () => {
    if (!audioFile) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    if (!modelName) {
      setError("モデルが選択されていません。右上の歯車アイコンから設定を行なってください。");
      return;
    }

    setIsProcessing(true);
    setError("");
    setTranscription("");
    setMinutes("");

    let finalAudioResource = audioFile;

    // Check if the uploaded file might be a video (MP4, WEBM, MOV, etc)
    const isVideoFile = (audioFile instanceof File && audioFile.type.startsWith('video/')) || 
                        (audioFile instanceof File && audioFile.name.toLowerCase().endsWith('.mp4'));

    if (isVideoFile) {
      try {
        finalAudioResource = await extractAudio(audioFile);
      } catch (err) {
        console.error(err);
        setFfmpegProgress(null);
        setIsProcessing(false);
        setError("動画からの音声抽出に失敗しました。壊れたファイルか、未対応の形式の可能性があります。");
        return;
      }
    }
    
    setFfmpegProgress(null); // finish extraction

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result.split(',')[1]);
          else reject(new Error("Failed to read file"));
        };
        reader.onerror = reject;
        reader.readAsDataURL(finalAudioResource);
      });

      const mimeType = finalAudioResource.type || "audio/webm";

      const prompt = `以下の音声の「完全な文字起こし」と、それを元にした「議事録」を作成してください。
会議の文脈を推測し、できるだけ話者を分離（話者A、話者Bなど）して文字起こししてください。

必ず以下のマークダウン形式で出力してください：

## 文字起こし
(ここにすべての文字起こしテキスト)

## 議事録
### 議題
(ここに主な議題)
### 決定事項
(ここに決定事項)
### ネクストアクション
(ここにネクストアクション)`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`[リクエスト送信先: ${modelName}] ` + (errorData.error?.message || "API通信エラーが発生しました"));
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      const transcriptionMatch = text.match(/## 文字起こし\n([\s\S]*?)(?=## 議事録|$)/);
      const minutesMatch = text.match(/## 議事録\n([\s\S]*)$/);

      if (transcriptionMatch) setTranscription(transcriptionMatch[1].trim());
      else setTranscription(text);

      if (minutesMatch) setMinutes(minutesMatch[1].trim());
      else setMinutes(text);

      setActiveTab("minutes");

    } catch (err: unknown) {
      setError((err as Error).message || "処理中にエラーが発生しました。ファイルサイズが大きすぎるか、データ形式が不正な可能性があります。");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    const textToCopy = activeTab === "minutes" ? minutes : transcription;
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Mini Rimo Voice
          </h1>
        </div>
        <button 
          onClick={() => {
            setInputKey(apiKey);
            setInputModelName(modelName);
            setShowSettings(true);
            if (apiKey && availableModels.length === 0) fetchModels(apiKey, modelName);
          }}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
          title="API Key Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8 mt-4">
        
        {/* API Key Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                Gemini API 設定
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                このアプリはお持ちの Google Gemini API キーを使用して処理を行います。キーはブラウザにのみ保存され、外部サーバーには送信されません。
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={inputKey}
                      onChange={(e) => setInputKey(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="AIzaSy..."
                    />
                    <button 
                      onClick={handleVerifyKey}
                      disabled={!inputKey || isLoadingModels}
                      className="whitespace-nowrap px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isLoadingModels ? <Loader2 className="w-5 h-5 animate-spin" /> : "キーを確認"}
                    </button>
                  </div>
                </div>

                {settingsError && (
                  <p className="text-sm text-red-600 font-medium mt-1">{settingsError}</p>
                )}

                <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">使用する AI モデル</label>
                  <input 
                    type="text"
                    list="gemini-models-list"
                    value={inputModelName}
                    onChange={(e) => setInputModelName(e.target.value)}
                    placeholder="gemini-1.5-pro 等を入力・または選択"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                  />
                  <datalist id="gemini-models-list">
                    {availableModels.map((m) => (
                      <option key={m.name} value={m.name}>{m.displayName || m.name}</option>
                    ))}
                  </datalist>
                  <p className="text-xs text-gray-500 mt-2">
                    リストから選択するか、ご自身でモデル名（例: <b>gemini-2.5-flash</b>）を手入力できます。
                  </p>
                </div>
                
                <div className="flex gap-3 justify-end mt-8">
                  {apiKey && (
                    <button 
                      onClick={removeApiKey}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                    >
                      削除
                    </button>
                  )}
                  {apiKey && (
                    <button 
                      onClick={() => { setInputKey(apiKey); setShowSettings(false); }}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                      キャンセル
                    </button>
                  )}
                  <button 
                    onClick={saveApiKey}
                    disabled={!inputKey.trim() || !inputModelName.trim()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    保存して始める
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {/* Input Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-1">
            <div className="grid md:grid-cols-2 gap-1 bg-gray-50/50 p-6 rounded-xl">
              
              {/* Record Audio */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                  <Mic className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-800">ブラウザで録音</h3>
                  <p className="text-sm text-gray-500 mt-1">会議や対話をそのまま録音します</p>
                </div>
                
                <div className="pt-2 w-full">
                  {!isRecording ? (
                    <button 
                      onClick={startRecording}
                      disabled={isProcessing || !!audioFile}
                      className="w-full py-3 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
                      録音を開始する
                    </button>
                  ) : (
                    <div className="w-full space-y-3">
                      <div className="text-2xl font-mono text-gray-700 font-semibold tracking-wider">
                        {formatTime(recordingTime)}
                      </div>
                      <button 
                        onClick={stopRecording}
                        className="w-full py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                      >
                        <Square className="w-4 h-4" />
                        録音を停止
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Audio */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-2">
                  <Upload className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-800">動画・音声をアップロード</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Zoomの動画データ（.mp4 等）から音声を自動抽出処理します
                  </p>
                </div>
                
                <div className="pt-2 w-full">
                  <label className={`w-full py-3 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isProcessing || isRecording ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-4 h-4" />
                    ファイルを選択
                    <input 
                      type="file" 
                      accept="audio/*,video/*" 
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isProcessing || isRecording}
                    />
                  </label>
                </div>
              </div>
              
            </div>
          </div>

          {/* Audio Player & Process Button */}
          {audioFile && (
            <div className="bg-blue-50/50 p-6 border-t border-gray-100 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                <div className="bg-white p-2 rounded-lg shadow-sm">
                  <FileAudio className="w-6 h-6 text-blue-600" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {audioFile instanceof File ? audioFile.name : `録音データ (${formatTime(recordingTime)})`}
                  </p>
                  <p className="text-xs text-gray-500">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              
              {audioUrl && (
                <div className="w-full lg:w-auto overflow-hidden rounded-lg">
                  {audioFile.type.startsWith('video/') ? (
                     <video src={audioUrl} controls className="h-10 w-full" />
                  ) : (
                     <audio src={audioUrl} controls className="h-10 w-full" />
                  )}
                </div>
              )}

              <div className="flex gap-2 ml-auto w-full lg:w-auto mt-4 lg:mt-0">
                <button 
                  onClick={clearAudio}
                  disabled={isProcessing}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  クリア
                </button>
                <button 
                  onClick={processAudio}
                  disabled={isProcessing}
                  className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 min-w-[160px] justify-center relative overflow-hidden"
                >
                  {isProcessing ? (
                     <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      処理中...
                     </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      議事録を作成
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Results Section */}
        {(transcription || minutes || isProcessing) && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[600px] animate-in slide-in-from-bottom-4 duration-500 relative">
            
            {/* FFmpeg Progress Overlay */}
            {ffmpegProgress && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-6 text-center">
                  <div className="w-16 h-16 mx-auto bg-blue-50 rounded-full flex flex-col items-center justify-center text-blue-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{ffmpegProgress.text}</h3>
                    <p className="text-gray-500 text-sm mt-2">動画から音声情報を分離しています。サーバーには送られず、お使いのパソコン内で処理されています（数秒〜数分で完了します）。</p>
                  </div>

                  <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${Math.max(5, ffmpegProgress.ratio * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-gray-100 p-2 bg-gray-50/50">
              <div className="flex gap-1">
                <button 
                  onClick={() => setActiveTab("minutes")}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === "minutes" ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                >
                  <LayoutList className="w-4 h-4" />
                  議事録
                </button>
                <button 
                  onClick={() => setActiveTab("transcription")}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${activeTab === "transcription" ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                >
                  <FileText className="w-4 h-4" />
                  文字起こし
                </button>
              </div>
              
              {!isProcessing && (transcription || minutes) && (
                <button 
                  onClick={copyToClipboard}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm mr-2"
                >
                  {copySuccess ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-green-700">コピーしました</span>
                    </>
                  ) : (
                    'テキストをコピー'
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-6 bg-white relative">
              {isProcessing && !ffmpegProgress ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-white/80 backdrop-blur-sm z-10">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                    <div className="w-12 h-12 absolute inset-0 border-4 border-blue-100 rounded-full -z-10" />
                  </div>
                  <p className="mt-4 font-medium text-gray-600">AIが音声を分析・テキスト化しています...</p>
                  <p className="text-sm text-gray-400 mt-2">音声の長さによっては数分かかる場合があります。</p>
                </div>
              ) : (
                <div className="prose prose-blue max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-gray-700 text-[15px] leading-relaxed">
                    {activeTab === "minutes" ? minutes : transcription}
                  </pre>
                  {!(activeTab === "minutes" ? minutes : transcription) && !isProcessing && (
                    <p className="text-gray-400 italic">結果がありません。</p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
