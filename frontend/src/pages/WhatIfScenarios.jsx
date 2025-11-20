import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@fortawesome/fontawesome-free/css/all.min.css';

const WhatIfScenarios = () => {
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Fetch chat sessions on mount
  useEffect(() => {
    fetchSessions();
    fetchUploadedDocs();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/chat/sessions');
      const data = await response.json();
      if (data.success) {
        setChatSessions(data.sessions);
        // If we have sessions and no current one selected, select the most recent
        if (data.sessions.length > 0 && !currentSessionId) {
          selectSession(data.sessions[0].id);
        } else if (data.sessions.length === 0) {
           // No sessions, clear messages
           setMessages([]);
           setCurrentSessionId(null);
        }
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const fetchUploadedDocs = async () => {
    try {
      const r = await fetch('/api/chat/documents');
      const d = await r.json();
      if (d.success && Array.isArray(d.documents)) {
        setUploadedFiles(d.documents.map(doc => ({ name: doc.filename, uploaded: true })));
      }
    } catch (error) {
      console.error('Error fetching docs:', error);
    }
  };

  const selectSession = async (sessionId) => {
    if (sessionId === currentSessionId) return;
    
    setCurrentSessionId(sessionId);
    setLoading(true);
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`);
      const data = await response.json();
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    // We don't create on backend until first message
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && uploadedFiles.filter(f => !f.uploaded).length === 0) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      files: uploadedFiles.filter(f => !f.uploaded).map(f => f.name),
      timestamp: new Date().toISOString(),
    };

    // Optimistic update
    setMessages(prev => [...prev, userMessage]);
    const msgToSend = inputMessage;
    setInputMessage('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', msgToSend);
      if (currentSessionId) {
        formData.append('session_id', currentSessionId);
      }
      
      // Only send new files
      const newFiles = uploadedFiles.filter(f => !f.uploaded);
      newFiles.forEach(file => {
        if (file.fileObj) {
           formData.append('files', file.fileObj);
        }
      });

      const response = await fetch('/api/chat/message', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        // If this was a new session, update ID and refresh list
        if (!currentSessionId && result.session_id) {
          setCurrentSessionId(result.session_id);
          fetchSessions(); // Refresh list to show new session title
        }

        const assistantMessage = {
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
          files: result.sources ? result.sources.map(s => s.source) : []
        };

        setMessages(prev => [...prev, assistantMessage]);
        
        // Mark files as uploaded
        if (newFiles.length > 0) {
          fetchUploadedDocs(); // Refresh doc list
        }
      } else {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    // Store actual file object for upload
    const newFiles = files.map(f => ({ 
      name: f.name, 
      uploaded: false,
      fileObj: f 
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const deleteChat = async (sessionId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        if (sessionId === currentSessionId) {
          createNewChat();
        }
        fetchSessions();
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-full h-full overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 h-full">
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4 h-full">
        {/* Left Sidebar */}
        <div className="bg-[--sidebar] rounded-[var(--radius)] border border-[--border] p-4 flex flex-col h-full overflow-hidden">
        {/* Upload Document Section */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[--foreground] mb-3">Upload Document</h3>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[--border] rounded-lg p-4 text-center cursor-pointer hover:border-[--ring] transition-all mb-3"
          >
            <p className="text-xs text-[--muted-foreground] mb-2">Drag and drop file here</p>
            <button className="px-4 py-2 bg-[--background] border border-[--border] rounded-lg text-xs text-[--foreground] hover:bg-[--muted] transition-all">
              Browse files
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept=".csv,.xlsx,.xls,.json,.txt,.pdf"
            className="hidden"
          />
        </div>

        {/* Uploaded Documents */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[--foreground]">Documents</h3>
            {uploadedFiles.length > 0 && (
              <button
                onClick={() => setUploadedFiles([])}
                className="text-xs text-[--primary] hover:opacity-90 transition-opacity"
              >
                Clear List
              </button>
            )}
          </div>
          
          {uploadedFiles.length > 0 ? (
            <div className="space-y-2 max-h-32 overflow-hidden overflow-y-auto">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 p-2 bg-[--background] rounded-lg text-xs border ${
                    file.uploaded ? 'border-green-500/50 bg-green-500/5' : 'border-[--border]'
                  }`}
                >
                  <i className={`fas fa-file ${file.uploaded ? 'text-green-500' : 'text-[--accent-foreground]'}`}></i>
                  <div className="flex-1 truncate">
                    <div className="text-[--foreground]">{file.name}</div>
                  </div>
                  {!file.uploaded && (
                    <button
                      onClick={() => removeFile(index)}
                      className="text-[--destructive] hover:opacity-90 transition-opacity"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[--muted-foreground] py-2">No documents uploaded</p>
          )}
        </div>

        {/* New Chat Button */}
        <div className="mb-3">
          <button 
            onClick={createNewChat}
            className="w-full px-4 py-2.5 bg-[--primary] text-[--primary-foreground] rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 font-medium text-sm"
          >
            <i className="fas fa-plus"></i>
            New Chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 flex flex-col overflow-hidden border-t border-[--border] pt-3">
          <h3 className="text-xs font-semibold text-[--muted-foreground] uppercase tracking-wider mb-2">Chat History</h3>
          
          <div className="flex-1 space-y-1 overflow-y-auto">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`group p-2.5 rounded-lg cursor-pointer transition-all ${
                  session.id === currentSessionId
                    ? 'bg-[--background] border border-[--ring]'
                    : 'bg-[--background]/50 hover:bg-[--background] border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <i className={`text-xs mt-0.5 ${
                    session.id === currentSessionId 
                      ? 'fas fa-comment-dots text-[--primary]' 
                      : 'fas fa-comment text-[--muted-foreground]'
                  }`}></i>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[--foreground] truncate">
                      {session.title}
                    </p>
                    <p className="text-xs text-[--muted-foreground] mt-0.5">
                      {session.messageCount} msgs • {getRelativeTime(session.lastMessage)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteChat(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 transition-all"
                    title="Delete chat"
                  >
                    <i className="fas fa-trash text-xs"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="bg-[--sidebar] rounded-[var(--radius)] border border-[--border] flex flex-col h-full overflow-hidden">
        {/* Messages Area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {messages.length === 0 && !loading && (
             <div className="flex flex-col items-center justify-center h-full text-[--muted-foreground] opacity-50">
                <i className="fas fa-comments text-4xl mb-4"></i>
                <p>Start a new conversation</p>
             </div>
          )}
          
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[--primary] shadow-md">
                  <i className="fas fa-robot text-[--primary-foreground] text-base"></i>
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                  message.role === 'user'
                    ? 'bg-[--primary] text-[--primary-foreground]'
                    : 'bg-[--card] border border-[--border] text-[--foreground]'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="text-sm leading-relaxed markdown-content">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({children}) => <strong className="font-bold text-[--primary]">{children}</strong>,
                        em: ({children}) => <em className="italic">{children}</em>,
                        ul: ({children}) => <ul className="list-disc list-inside mb-2 ml-2">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal list-inside mb-2 ml-2">{children}</ol>,
                        li: ({children}) => <li className="mb-1">{children}</li>,
                        h1: ({children}) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                        h2: ({children}) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                        h3: ({children}) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                        blockquote: ({children}) => <blockquote className="border-l-4 border-[--primary] pl-3 my-2 italic">{children}</blockquote>,
                        code: ({inline, children}) => inline 
                          ? <code className="px-1.5 py-0.5 bg-[--muted]/30 rounded text-xs font-mono">{children}</code>
                          : <pre className="overflow-x-auto bg-[--muted]/30 p-3 rounded my-2 text-xs"><code className="font-mono">{children}</code></pre>,
                        hr: () => <hr className="my-3 border-[--border]" />
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                )}
                {message.files && message.files.length > 0 && (
                  <div className="mt-3 space-y-1.5 pt-2 border-t border-[--border]">
                    {message.files.map((file, idx) => (
                      <div key={idx} className="text-xs opacity-75 flex items-center gap-1.5">
                        <i className="fas fa-paperclip"></i>
                        <span>{file}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs opacity-50 mt-2">{formatTime(message.timestamp)}</p>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[--primary] shadow-md">
                  <i className="fas fa-user text-[--primary-foreground] text-base"></i>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[--primary] shadow-md">
                <i className="fas fa-robot text-[--primary-foreground] text-base"></i>
              </div>
              <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-[--card] border border-[--border] shadow-sm">
                <div className="flex gap-1.5 items-center">
                  <div className="w-2.5 h-2.5 bg-[--primary] rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                  <div className="w-2.5 h-2.5 bg-[--primary] rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-2.5 h-2.5 bg-[--primary] rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area - Sticky at Bottom */}
        <div className="sticky bottom-0 bg-[--card] border-t border-[--border] p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 bg-[--background] rounded-xl p-2 border border-[--border]">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Query..."
                className="flex-1 h-10 px-4 bg-transparent text-[--foreground] focus:outline-none placeholder:text-[--muted-foreground]"
                disabled={loading}
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || (!inputMessage.trim() && uploadedFiles.filter(f => !f.uploaded).length === 0)}
                className="flex-shrink-0 w-10 h-10 rounded-lg bg-[--primary] text-[--primary-foreground] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                title="Send message"
              >
                <i className="fas fa-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  );
};

export default WhatIfScenarios;