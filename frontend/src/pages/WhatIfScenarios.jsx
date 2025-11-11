import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@fortawesome/fontawesome-free/css/all.min.css';

const WhatIfScenarios = () => {
  const [chatSessions, setChatSessions] = useState([
    {
      id: 1,
      title: 'Current Conversation',
      lastMessage: new Date(),
      messageCount: 1,
      active: true,
      messages: [
        {
          role: 'assistant',
          content: 'Hello! I\'m your Supply Chain AI Assistant. You can ask me questions about your supply chain data, upload files for analysis, or request insights. How can I help you today?',
          timestamp: new Date(),
        }
      ]
    }
  ]);
  const [currentSessionId, setCurrentSessionId] = useState(1);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your Supply Chain AI Assistant. You can ask me questions about your supply chain data, upload files for analysis, or request insights. How can I help you today?',
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isInitialMount = useRef(true);

  // Auto-scroll to bottom when new messages arrive (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Scroll only the messages container, not the entire page
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Restore chat state on mount (revive timestamps)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('chatState') || 'null');
      if (saved && typeof saved === 'object') {
        const reviveMessage = (m) => ({
          ...m,
          timestamp: m?.timestamp ? new Date(m.timestamp) : new Date(),
        });

        if (Array.isArray(saved.chatSessions) && saved.chatSessions.length > 0) {
          const revivedSessions = saved.chatSessions.map((s) => ({
            ...s,
            lastMessage: s?.lastMessage ? new Date(s.lastMessage) : new Date(),
            messages: Array.isArray(s.messages) ? s.messages.map(reviveMessage) : [],
          }));
          setChatSessions(revivedSessions);
          setCurrentSessionId(saved.currentSessionId || revivedSessions[0].id);
          const revivedMessages = Array.isArray(saved.messages)
            ? saved.messages.map(reviveMessage)
            : revivedSessions[0].messages || [];
          setMessages(revivedMessages);
        }
        if (Array.isArray(saved.uploadedFiles)) {
          setUploadedFiles(saved.uploadedFiles.map((f) => ({ name: f.name, uploaded: !!f.uploaded })));
        }
      }
    } catch {}
  }, []);

  // Fetch uploaded documents from backend and merge (to show persisted KB docs)
  useEffect(() => {
    let cancelled = false;
    const fetchDocs = async () => {
      try {
        const r = await fetch('/api/chat/documents');
        const d = await r.json().catch(() => ({}));
        const docs = Array.isArray(d?.documents) ? d.documents : [];
        const mapped = docs.map(doc => ({ name: doc.filename || 'document', uploaded: true }));
        if (!cancelled && mapped.length) {
          setUploadedFiles(prev => {
            const existing = new Set(prev.map(f => f.name));
            const merged = [...prev];
            for (const m of mapped) {
              if (!existing.has(m.name)) merged.push(m);
            }
            return merged;
          });
        }
      } catch {}
    };
    fetchDocs();
    return () => { cancelled = true; };
  }, []);

  // Persist chat state
  useEffect(() => {
    try {
      const snapshot = {
        chatSessions,
        currentSessionId,
        messages,
        uploadedFiles: uploadedFiles.map(f => ({ name: f.name, uploaded: !!f.uploaded })),
      };
      localStorage.setItem('chatState', JSON.stringify(snapshot));
    } catch {}
  }, [chatSessions, currentSessionId, messages, uploadedFiles]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && uploadedFiles.length === 0) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      files: uploadedFiles.map(f => f.name),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', inputMessage);
      
      // Only send new files that haven't been uploaded yet
      const newFiles = uploadedFiles.filter(f => !f.uploaded);
      newFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/chat/message', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      const assistantMessage = {
        role: 'assistant',
        content: result.response || 'I apologize, but I couldn\'t process your request. Please try again.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Mark new files as uploaded, keep them in the sidebar (store as name + flag)
      if (newFiles.length > 0) {
        setUploadedFiles(prev => prev.map(f => ({ name: f.name, uploaded: true })));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again later.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles(prev => [...prev, ...files]);
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

  const formatTime = (ts) => {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getRelativeTime = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return 'Last week';
  };

  const createNewChat = () => {
    const newSessionId = Date.now(); // Use timestamp for unique ID
    const newSession = {
      id: newSessionId,
      title: 'New Conversation',
      lastMessage: new Date(),
      messageCount: 1,
      messages: [
        {
          role: 'assistant',
          content: 'Hello! I\'m your Supply Chain AI Assistant. How can I help you today?',
          timestamp: new Date(),
        }
      ],
      active: false
    };

    // Save current session messages
    setChatSessions(prev => prev.map(session => 
      session.id === currentSessionId 
        ? { ...session, messages, messageCount: messages.length, active: false }
        : { ...session, active: false }
    ));

    setChatSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newSessionId);
    setMessages(newSession.messages);
    setUploadedFiles([]);
  };

  const switchChatSession = (sessionId) => {
    if (sessionId === currentSessionId) return;

    // Get the session we're switching to before updating state
    const selectedSession = chatSessions.find(s => s.id === sessionId);

    // Save current session and update active states
    setChatSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return { ...session, messages, messageCount: messages.length, active: false };
      }
      if (session.id === sessionId) {
        return { ...session, active: true };
      }
      return { ...session, active: false };
    }));

    // Load selected session messages
    if (selectedSession && selectedSession.messages) {
      setMessages(selectedSession.messages);
      setCurrentSessionId(sessionId);
      setUploadedFiles([]);
    }
  };

  const deleteChat = (sessionId, e) => {
    e.stopPropagation();
    if (chatSessions.length === 1) return; // Don't delete last chat

    const remainingChats = chatSessions.filter(s => s.id !== sessionId);
    
    if (sessionId === currentSessionId && remainingChats.length > 0) {
      // Switch to first available chat before deleting
      const nextChat = remainingChats[0];
      setMessages(nextChat.messages || []);
      setCurrentSessionId(nextChat.id);
    }
    
    setChatSessions(remainingChats);
  };

  // Update session when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setChatSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          // Find first user message for title
          const firstUserMessage = messages.find(m => m.role === 'user');
          let newTitle = session.title;
          
          // Update title if it's still default and we have a user message
          if ((session.title === 'Current Conversation' || session.title === 'New Conversation') && firstUserMessage) {
            newTitle = firstUserMessage.content.substring(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '');
          }
          
          return {
            ...session,
            messageCount: messages.length,
            lastMessage: new Date(),
            title: newTitle,
            messages: messages
          };
        }
        return session;
      }));
    }
  }, [messages, currentSessionId]);

  return (
    <div className="w-full h-full overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 h-full">
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4 h-full">
        {/* Left Sidebar */}
        <div className="bg-[--sidebar] rounded-[var(--radius)] border border-[--border] p-4 flex flex-col h-full overflow-hidden">
        {/* Upload Document Section */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[--foreground] mb-3">Upload Document</h3>
          <div className="text-xs text-[--muted-foreground] mb-2">Choose a file</div>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[--border] rounded-lg p-4 text-center cursor-pointer hover:border-[--ring] transition-all mb-3"
          >
            <p className="text-xs text-[--muted-foreground] mb-2">Drag and drop file here</p>
            <p className="text-xs text-[--muted-foreground] mb-3">Limit 200MB per file • PDF, CSV, Excel, JSON, TXT</p>
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
                title="Clear UI list (documents remain in knowledge base)"
              >
                Clear List
              </button>
            )}
          </div>
          {uploadedFiles.length > 0 && (
            <p className="text-xs text-[--muted-foreground] mb-2">
              ℹ️ Uploaded docs persist across all chats
            </p>
          )}
          
          {uploadedFiles.length > 0 ? (
            <div className="space-y-2 max-h-32 overflow-hidden">
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
                    {file.uploaded && (
                      <div className="text-green-500 text-xs">✓ In Knowledge Base</div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-[--destructive] hover:opacity-90 transition-opacity"
                    title="Remove"
                  >
                    <i className="fas fa-times"></i>
                  </button>
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
          
          <div className="flex-1 space-y-1 overflow-hidden">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => switchChatSession(session.id)}
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
                  {chatSessions.length > 1 && (
                    <button
                      onClick={(e) => deleteChat(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 transition-all"
                      title="Delete chat"
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  )}
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
                disabled={loading || (!inputMessage.trim() && uploadedFiles.length === 0)}
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