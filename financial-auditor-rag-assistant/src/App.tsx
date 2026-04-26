/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, 
  Upload, 
  Send, 
  Trash2, 
  Search, 
  FileCheck, 
  AlertCircle,
  Loader2,
  ChevronRight,
  Plus,
  ShieldAlert,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { Document, Message } from './types';
import { extractTextFromPDF, extractTextFromTXT } from './lib/pdf-utils';
import { askAuditor, summarizeRisks } from './services/gemini';

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const onDrop = async (acceptedFiles: File[]) => {
    setIsUploading(true);
    for (const file of acceptedFiles) {
      try {
        let content = '';
        if (file.type === 'application/pdf') {
          content = await extractTextFromPDF(file);
        } else if (file.type === 'text/plain') {
          content = await extractTextFromTXT(file);
        } else {
          continue;
        }

        const isApple10K = file.name.toLowerCase().includes('apple') && file.name.toLowerCase().includes('10-k');
        
        const newDoc: Document = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          content,
          type: file.type,
          size: file.size,
          isPrimary: isApple10K || documents.length === 0, // Auto-set as primary if it's Apple 10-K or the first doc
        };

        if (!content || content.trim().length === 0) {
          alert(`Warning: No text could be extracted from ${file.name}. The file might be empty, encrypted, or contain only images.`);
        }

        setDocuments(prev => {
          // If the new doc is primary, unset others
          if (newDoc.isPrimary) {
            return [...prev.map(d => ({ ...d, isPrimary: false })), newDoc];
          }
          return [...prev, newDoc];
        });
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
      }
    }
    setIsUploading(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
    }
  });

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await askAuditor(input, documents, messages);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error getting response:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSummarizeRisks = async (doc: Document) => {
    if (summarizingId) return;
    
    setSummarizingId(doc.id);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Generate a Risk Insight Summary for ${doc.name}`,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    try {
      const response = await summarizeRisks(doc);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error summarizing risks:', error);
    } finally {
      setIsProcessing(false);
      setSummarizingId(null);
    }
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <FileCheck className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Audit Assistant</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Financial RAG System</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 px-2 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Documents
            </h2>
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer text-center",
                isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                isUploading && "opacity-50 cursor-not-allowed"
              )}
            >
              <input {...getInputProps()} />
              {isUploading ? (
                <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin" />
              ) : (
                <>
                  <Plus className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500 font-medium">Drop PDF or TXT files here</p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold text-slate-700">Active Records</h2>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {documents.length}
              </span>
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {documents.map((doc) => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="group flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-white hover:border-slate-200 transition-all shadow-sm"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="relative">
                        <FileText className={cn("w-4 h-4 shrink-0", doc.isPrimary ? "text-amber-500" : "text-indigo-500")} />
                        {doc.isPrimary && (
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full border border-white" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-medium truncate text-slate-700">{doc.name}</span>
                        {doc.isPrimary && (
                          <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter">Primary Source</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => handleSummarizeRisks(doc)}
                        disabled={!!summarizingId}
                        title="Risk Insights"
                        className={cn(
                          "p-1 rounded hover:bg-amber-50 hover:text-amber-600 transition-all",
                          summarizingId === doc.id && "animate-pulse text-amber-600"
                        )}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => removeDocument(doc.id)}
                        className="p-1 rounded hover:bg-red-50 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {documents.length === 0 && (
                <div className="text-center py-8 px-4 border border-dashed border-slate-200 rounded-lg">
                  <p className="text-[11px] text-slate-400 italic">No documents uploaded yet</p>
                </div>
              )}
            </div>
          </div>

          {documents.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 px-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Quick Audit Actions
              </h2>
              <button
                onClick={() => handleSummarizeRisks(documents.find(d => d.isPrimary) || documents[0])}
                disabled={isProcessing}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-900 hover:bg-amber-100 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="text-xs font-bold">Summarize Risk Factors</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100" />
              </button>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              RA
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate">rsunkara1272@gmail.com</p>
              <p className="text-[10px] text-slate-500 font-medium">Senior Auditor</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-400">
              <Search className="w-4 h-4" />
              <span className="text-sm font-medium">Financial Audit Query Engine</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">System Ready</span>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-4">
                <FileCheck className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Senior Auditor RAG Assistant</h2>
              <p className="text-slate-500 leading-relaxed">
                Upload your financial statements, balance sheets, or audit reports to begin. 
                I will provide precise answers based <span className="font-bold text-slate-900">only</span> on your documents, 
                complete with citations and markdown tables.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full pt-8">
                {[
                  "What was the total revenue in Q3?",
                  "Compare net income across years",
                  "Summarize all Risk Factors (Item 1A)",
                  "Check debt-to-equity ratios"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="p-4 text-left text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group flex items-center justify-between"
                  >
                    {suggestion}
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
                      <FileCheck className="w-4 h-4" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[85%] rounded-2xl p-5 shadow-sm border",
                    msg.role === 'user' 
                      ? "bg-indigo-600 text-white border-indigo-500" 
                      : "bg-white text-slate-800 border-slate-100"
                  )}>
                    <div className={cn(
                      "prose prose-sm max-w-none",
                      msg.role === 'user' ? "prose-invert" : "prose-slate"
                    )}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 shrink-0 font-bold text-xs">
                      U
                    </div>
                  )}
                </motion.div>
              ))}
              {isProcessing && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 animate-pulse">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    <span className="text-sm font-medium text-slate-500 italic">Auditing documents...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-8 bg-white border-t border-slate-100">
          <div className="max-w-4xl mx-auto">
            {documents.length === 0 && (
              <div className="mb-4 flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                <AlertCircle className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-wider">Warning: No documents uploaded. Analysis will be limited.</p>
              </div>
            )}
            <div className="relative group">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={documents.length > 0 ? "Ask a question about the financial records..." : "Please upload documents first..."}
                disabled={isProcessing}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-6 pr-16 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner text-slate-800 placeholder:text-slate-400"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-lg"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-3 text-[10px] text-center text-slate-400 font-medium uppercase tracking-widest">
              Strictly Factual Retrieval • No Investment Advice • Professional Audit Standard
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
