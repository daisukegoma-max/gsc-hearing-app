'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Send, Loader2 } from 'lucide-react'

export default function GSCHearingApp() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationStage, setConversationStage] = useState('opening')
  const [isConversationEnded, setIsConversationEnded] = useState(false)
  const [evaluationData, setEvaluationData] = useState({
    entrepreneurialIntent: null,
    seedPromise: null,
    preparedness: null,
    managementQuality: null,
    userChallenges: [],
    interests: []
  })
  const messagesEndRef = useRef(null)
  const [sessionId] = useState(() => 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9))

  const CLOUDFLARE_WORKER_URL = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL
  const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const initialMessage = {
      role: 'assistant',
      content: 'こんにちは。本日はお時間をいただきありがとうございます。私は内閣官房が推進するグローバルスタートアップキャンパス構想について研究者の皆さまとお話しするAIアシスタントです。GSC構想は日本の研究力と起業家精神を融合させ世界に通用するスタートアップを生み出すための新しい取り組みです。まずあなたの研究活動について少しお聞かせいただけますか。現在の研究活動においてどのような課題や将来への展望をお持ちですか'
    }
    setMessages([initialMessage])
  }, [])

  const buildSystemPrompt = () => {
    return 'あなたは日本の内閣官房が推進するグローバルスタートアップキャンパス構想の認知度向上と研究者ポテンシャル評価を行うAIアシスタントです。研究者の課題感や興味に寄り添いGSC構想の魅力を伝える。対話を通じて起業意欲、シーズ有望性、起業準備度、経営資質の4つの評価軸で研究者のポテンシャルを自然に評価する。自然で人間味のある対話を心がけ機械的な質問は避ける。1回の応答は簡潔に200-300文字程度。メッセージ数が15を超えた場合または研究者が十分な情報を得たと判断した場合は自然な形でクロージングメッセージを送る。クロージングメッセージの最後には必ずEND_CONVERSATIONというタグを付ける。現在の会話ステージ: ' + conversationStage + ' メッセージ数: ' + messages.length
  }

  const analyzeResponse = (userMessage) => {
    const newEvalData = { ...evaluationData }
    
    if (userMessage.includes('起業') || userMessage.includes('スタートアップ') || userMessage.includes('会社')) {
      newEvalData.entrepreneurialIntent = 'high'
    }
    if (userMessage.includes('社会実装') || userMessage.includes('実用化') || userMessage.includes('製品化')) {
      newEvalData.seedPromise = 'high'
    }
    if (userMessage.includes('資金') || userMessage.includes('予算') || userMessage.includes('グラント')) {
      if (!newEvalData.userChallenges.includes('funding')) {
        newEvalData.userChallenges.push('funding')
      }
    }
    if (userMessage.includes('連携') || userMessage.includes('ネットワーク') || userMessage.includes('コラボ')) {
      if (!newEvalData.userChallenges.includes('networking')) {
        newEvalData.userChallenges.push('networking')
      }
    }

    setEvaluationData(newEvalData)
  }

  const saveToSpreadsheet = async () => {
    console.log('Spreadsheetへの自動保存を開始します')
    
    const exportData = {
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      messages: messages,
      evaluationData: evaluationData,
      messageCount: messages.length
    }

    try {
      const response = await fetch(CLOUDFLARE_WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': AUTH_TOKEN
        },
        body: JSON.stringify(exportData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error('保存失敗: ' + response.status)
      }

      const result = await response.json()
      console.log('Spreadsheetへの保存が完了しました:', result)
      return true
      
    } catch (error) {
      console.error('Spreadsheet保存エラー:', error)
      return false
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = {
      role: 'user',
      content: inputValue
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildSystemPrompt(),
          messages: [...conversationHistory, { role: 'user', content: inputValue }]
        })
      })

      if (!response.ok) {
        throw new Error('API request failed: ' + response.status)
      }

      const data = await response.json()
      const assistantResponse = data.content[0].text
      
      const isEndingConversation = assistantResponse.includes('END_CONVERSATION')
      const cleanedResponse = assistantResponse.replace('END_CONVERSATION', '').trim()
      
      const assistantMessage = {
        role: 'assistant',
        content: cleanedResponse
      }

      setMessages(prev => [...prev, assistantMessage])
      analyzeResponse(inputValue)

      if (isEndingConversation && !isConversationEnded) {
        console.log('対話終了を検知しました。3秒後に自動保存します')
        setIsConversationEnded(true)
        setConversationStage('ended')
        
        setTimeout(async () => {
          await saveToSpreadsheet()
        }, 3000)
      }

      if (messages.length > 6 && conversationStage === 'opening') {
        setConversationStage('deepening')
      }
      if (messages.length > 12 && conversationStage === 'deepening') {
        setConversationStage('closing')
      }

    } catch (error) {
      console.error('Error:', error)
      const errorMessage = {
        role: 'assistant',
        content: '申し訳ございません。一時的な問題が発生しました。もう一度お試しください。'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = {
      role: 'user',
      content: inputValue
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildSystemPrompt(),
          messages: [...conversationHistory, { role: 'user', content: inputValue }]
        })
      })

      if (!response.ok) {
        throw new Error('API request failed: ' + response.status)
      }

      const data = await response.json()
      const assistantResponse = data.content[0].text
      
      const isEndingConversation = assistantResponse.includes('END_CONVERSATION')
      const cleanedResponse = assistantResponse.replace('END_CONVERSATION', '').trim()
      
      const assistantMessage = {
        role: 'assistant',
        content: cleanedResponse
      }

      setMessages(prev => [...prev, assistantMessage])
      analyzeResponse(inputValue)

      if (isEndingConversation && !isConversationEnded) {
        console.log('対話終了を検知しました。3秒後に自動保存します')
        setIsConversationEnded(true)
        setConversationStage('ended')
        
        setTimeout(async () => {
          await saveToSpreadsheet()
        }, 3000)
      }

      if (messages.length > 6 && conversationStage === 'opening') {
        setConversationStage('deepening')
      }
      if (messages.length > 12 && conversationStage === 'deepening') {
        setConversationStage('closing')
      }

    } catch (error) {
      console.error('Error:', error)
      const errorMessage = {
        role: 'assistant',
        content: '申し訳ございません。一時的な問題が発生しました。もう一度お試しください。'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">GSC対話型ヒアリング</h1>
          <p className="text-sm text-gray-600 mt-1">グローバルスタートアップキャンパス構想</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={'flex ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={'max-w-[80%] rounded-2xl px-5 py-3 ' + (message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 shadow-sm border border-gray-100')}>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl px-5 py-3 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="animate-spin" size={20} />
                  <span>考え中...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isConversationEnded ? '対話は終了しました' : 'メッセージを入力してください...'}
            disabled={isConversationEnded}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows="1"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || isConversationEnded}
            className="bg-indigo-600 text-white rounded-xl px-6 py-3 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send size={20} />
            <span className="hidden sm:inline">送信</span>
          </button>
        </div>
      </div>
    </div>
  )
}
