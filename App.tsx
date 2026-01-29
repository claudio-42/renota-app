import React, { useState, useEffect, useRef } from 'react';
import { LogMessage, ProcessingResult, TableRow } from './types';
import { extractTextFromImage, extractTextFromPDF, parseTableText, findMatchingRow } from './services/logic';

const App: React.FC = () => {
    // Theme State
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    // Config State
    const [marketplace, setMarketplace] = useState<string>('Shopee');
    const [unidade, setUnidade] = useState<string>('Ninja PR');

    // File State
    const [tableFile, setTableFile] = useState<File | null>(null);
    const [pdfFiles, setPdfFiles] = useState<File[]>([]);
    
    // Process State
    const [processing, setProcessing] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [results, setResults] = useState<ProcessingResult[]>([]);
    const [showLog, setShowLog] = useState<boolean>(false);

    // Refs
    const logContainerRef = useRef<HTMLDivElement>(null);
    const tableInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // Setup PDF.js worker on mount
    useEffect(() => {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }, []);

    // Theme Effect
    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, showLog]);

    // Logging Helper
    const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
        const newLog: LogMessage = {
            id: Math.random().toString(36).substr(2, 9),
            time: new Date().toLocaleTimeString(),
            message,
            type
        };
        setLogs(prev => [...prev, newLog]);
    };

    // Handlers
    const handleTableUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0] as File;
            if (!file.type.startsWith('image/')) {
                alert('Por favor, envie uma imagem válida!');
                return;
            }
            setTableFile(file);
        }
    };

    const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = (Array.from(e.target.files) as File[]).filter(f => f.type === 'application/pdf');
            setPdfFiles(prev => [...prev, ...newFiles]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add('border-brand-red', 'bg-brand-red/10');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('border-brand-red', 'bg-brand-red/10');
    };

    const handleTableDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-brand-red', 'bg-brand-red/10');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0] as File;
            if (file.type.startsWith('image/')) {
                setTableFile(file);
            }
        }
    };

    const handlePdfDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-brand-red', 'bg-brand-red/10');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type === 'application/pdf');
            setPdfFiles(prev => [...prev, ...newFiles]);
        }
    };

    const clearTable = () => setTableFile(null);
    const clearPdfs = () => setPdfFiles([]);
    const resetAll = () => {
        setTableFile(null);
        setPdfFiles([]);
        setResults([]);
        setLogs([]);
        setProgress(0);
        setShowLog(false);
    };

    const processDocuments = async () => {
        if (!tableFile || pdfFiles.length === 0) return;

        setProcessing(true);
        setResults([]);
        setLogs([]);
        setShowLog(true);
        setProgress(0);
        addLog('Iniciando processamento...', 'info');

        try {
            // Step 1: Extract Text from Table Image
            const tableText = await extractTextFromImage(tableFile, addLog);
            
            // Step 2: Parse Table Data
            const tableData = parseTableText(tableText, marketplace, addLog);

            if (tableData.length === 0) {
                throw new Error('Nenhum dado válido encontrado na tabela. Verifique a imagem.');
            }
            
            addLog(`Total de registros na tabela: ${tableData.length}`, 'success');

            // Step 3: Process PDFs
            const newResults: ProcessingResult[] = [];
            
            for (let i = 0; i < pdfFiles.length; i++) {
                const file = pdfFiles[i];
                const percent = Math.round(((i + 1) / pdfFiles.length) * 100);
                setProgress(percent);
                
                addLog(`Processando: ${file.name}...`, 'info');
                
                const pdfText = await extractTextFromPDF(file, marketplace, addLog);
                const matchedRow = findMatchingRow(pdfText, tableData, file.name, marketplace, addLog);
                
                if (matchedRow) {
                    const prefixo = matchedRow.tipo || 'NFS';
                    const newName = `${prefixo} ${matchedRow.nf} - ${matchedRow.descricao} - R$${matchedRow.valor.toFixed(2).replace('.', ',')} - ${marketplace} - ${unidade}.pdf`;
                    
                    newResults.push({
                        originalName: file.name,
                        newName: newName,
                        file: file,
                        matched: true
                    });
                    
                    addLog(`✓ Correspondência encontrada: ${newName}`, 'success');
                } else {
                    newResults.push({
                        originalName: file.name,
                        newName: file.name,
                        file: file,
                        matched: false
                    });
                    
                    addLog(`✗ Nenhuma correspondência para: ${file.name}`, 'error');
                }
            }
            setResults(newResults);

        } catch (error: any) {
            addLog(`Erro fatal: ${error.message}`, 'error');
            alert(`Erro: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const downloadZip = async () => {
        if (!results.some(r => r.matched)) return;
        
        addLog('Gerando arquivo ZIP...', 'info');
        const zip = new window.JSZip();
        
        const matched = results.filter(r => r.matched);
        for (const result of matched) {
            const arrayBuffer = await result.file.arrayBuffer();
            zip.file(result.newName, arrayBuffer);
        }
        
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFS_Renomeadas_${new Date().getTime()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        
        addLog('Download iniciado!', 'success');
    };

    const matchedCount = results.filter(r => r.matched).length;
    const unmatchedCount = results.filter(r => !r.matched).length;

    return (
        <div className="min-h-screen py-10 px-4 font-sans text-gray-900 dark:text-brand-white selection:bg-brand-red/30 transition-colors duration-300 overflow-x-hidden">
            <div className="max-w-5xl mx-auto space-y-8 relative z-10">
                
                {/* Theme Toggle Button */}
                <div className="absolute top-0 right-0 pt-2 z-20">
                    <button 
                        onClick={toggleTheme}
                        className="p-3 rounded-full glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-all text-xl"
                        title={theme === 'dark' ? "Modo Claro" : "Modo Escuro"}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>

                {/* Header */}
                <header className="text-center space-y-2 mb-10 pt-6">
                    <div className="flex items-center justify-center gap-4">
                        <img 
                            src={theme === 'dark' ? './public/logos/Logo-03.png' : './public/logos/Logo-04.png'}
                            alt="RENOTA Logo"
                            className="h-48 w-auto"
                        />
                        <h1 className="text-5xl font-dense font-semibold text-brand-red tracking-wide">
                            RENOTA
                        </h1>
                    </div>
                </header>

                {/* Configuration */}
                <section className="glass-panel p-6 rounded-2xl">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-brand-white mb-6 flex items-center">
                        <span className="bg-brand-red text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-semibold shadow-lg shadow-brand-red/20">1</span>
                        Configurações
                    </h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Marketplace</label>
                            <div className="relative">
                                <select 
                                    value={marketplace} 
                                    onChange={(e) => setMarketplace(e.target.value)}
                                    className="w-full p-3 rounded-xl glass-input appearance-none cursor-pointer text-gray-900 dark:text-white"
                                >
                                    <option className="bg-white text-gray-900 dark:bg-brand-gray dark:text-white" value="Shopee">Shopee</option>
                                    <option className="bg-white text-gray-900 dark:bg-brand-gray dark:text-white" value="Mercado Livre">Mercado Livre</option>
                                    <option className="bg-white text-gray-900 dark:bg-brand-gray dark:text-white" value="Magalu">Magalu</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-brand-red">▼</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Unidade</label>
                            <div className="relative">
                                <select 
                                    value={unidade} 
                                    onChange={(e) => setUnidade(e.target.value)}
                                    className="w-full p-3 rounded-xl glass-input appearance-none cursor-pointer text-gray-900 dark:text-white"
                                >
                                    <option className="bg-white text-gray-900 dark:bg-brand-gray dark:text-white" value="Ninja PR">Ninja PR</option>
                                    <option className="bg-white text-gray-900 dark:bg-brand-gray dark:text-white" value="Ninja SC">Ninja SC</option>
                                    <option className="bg-white text-gray-900 dark:bg-brand-gray dark:text-white" value="Ninja SP">Ninja SP</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-brand-red">▼</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Upload Section (Side by Side) */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Upload Table */}
                    <section className="glass-panel p-6 rounded-2xl transition-all h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-brand-white flex items-center">
                                <span className="bg-brand-red text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-semibold shadow-lg shadow-brand-red/20">2</span>
                                Upload da Tabela
                            </h2>
                            {tableFile && (
                                <button onClick={clearTable} className="text-xs bg-brand-red/20 text-red-600 dark:text-red-400 px-3 py-1 rounded-full hover:bg-brand-red/30 transition border border-brand-red/20">
                                    Remover
                                </button>
                            )}
                        </div>
                        
                        {!tableFile ? (
                            <div 
                                onClick={() => tableInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleTableDrop}
                                className="border-2 border-dashed border-gray-400 dark:border-gray-600/50 rounded-xl p-6 text-center cursor-pointer hover:border-brand-red hover:bg-brand-red/5 transition-all group flex-grow flex flex-col justify-center items-center"
                            >
                                <div className="text-4xl mb-3 text-gray-400 dark:text-gray-500 group-hover:text-brand-red transition-colors group-hover:scale-110 duration-300">📊</div>
                                <p className="font-medium text-gray-600 dark:text-gray-300">Clique ou arraste a imagem</p>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Nº NFS, Descrição e Valor</p>
                                <input 
                                    type="file" 
                                    ref={tableInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleTableUpload} 
                                />
                            </div>
                        ) : (
                            <div className="flex items-center p-4 bg-gray-100 dark:bg-brand-gray/50 border border-gray-200 dark:border-brand-white/5 rounded-xl flex-grow">
                                <div className="text-2xl mr-4 text-green-600 dark:text-green-500">✅</div>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white text-sm break-all">{tableFile.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{(tableFile.size / 1024).toFixed(2)} KB</p>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Upload PDFs */}
                    <section className="glass-panel p-6 rounded-2xl transition-all h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-brand-white flex items-center">
                                <span className="bg-brand-red text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-semibold shadow-lg shadow-brand-red/20">3</span>
                                Upload dos PDFs
                            </h2>
                            {pdfFiles.length > 0 && (
                                <button onClick={clearPdfs} className="text-xs bg-brand-red/20 text-red-600 dark:text-red-400 px-3 py-1 rounded-full hover:bg-brand-red/30 transition border border-brand-red/20">
                                    Limpar
                                </button>
                            )}
                        </div>

                        <div 
                            onClick={() => pdfInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handlePdfDrop}
                            className={`border-2 border-dashed border-gray-400 dark:border-gray-600/50 rounded-xl p-6 text-center cursor-pointer hover:border-brand-red hover:bg-brand-red/5 transition-all group flex-col justify-center items-center ${pdfFiles.length > 0 ? 'hidden' : 'flex flex-grow'}`}
                        >
                            <div className="text-4xl mb-3 text-gray-400 dark:text-gray-500 group-hover:text-brand-red transition-colors group-hover:scale-110 duration-300">📑</div>
                            <p className="font-medium text-gray-600 dark:text-gray-300">Clique ou arraste os PDFs</p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Múltiplos arquivos</p>
                            <input 
                                type="file" 
                                ref={pdfInputRef} 
                                className="hidden" 
                                accept="application/pdf" 
                                multiple 
                                onChange={handlePdfUpload} 
                            />
                        </div>

                        {pdfFiles.length > 0 && (
                            <div className="flex flex-col flex-grow">
                                <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar mb-2 flex-grow">
                                    {pdfFiles.map((file, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-white/50 dark:bg-brand-gray/30 rounded-lg border border-gray-200 dark:border-brand-white/5">
                                            <div className="flex items-center overflow-hidden">
                                                <span className="text-gray-500 mr-3 text-xs font-mono">{String(idx + 1).padStart(2, '0')}</span>
                                                <span className="truncate text-sm text-gray-700 dark:text-gray-300">{file.name}</span>
                                            </div>
                                            <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">{(file.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => pdfInputRef.current?.click()}
                                    className="text-xs w-full py-2 border border-dashed border-gray-400 dark:border-gray-600 text-gray-500 hover:text-brand-red hover:border-brand-red rounded-lg transition"
                                >
                                    + Adicionar mais
                                </button>
                                <input 
                                    type="file" 
                                    ref={pdfInputRef} 
                                    className="hidden" 
                                    accept="application/pdf" 
                                    multiple 
                                    onChange={handlePdfUpload} 
                                />
                            </div>
                        )}
                    </section>
                </div>

                {/* Action Button */}
                <button 
                    onClick={processDocuments}
                    disabled={!tableFile || pdfFiles.length === 0 || processing}
                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-xl transition-all transform hover:scale-[1.01] active:scale-[0.99] tracking-wide
                        ${(!tableFile || pdfFiles.length === 0 || processing) 
                            ? 'bg-gray-200 text-gray-400 dark:bg-brand-gray dark:text-gray-500 cursor-not-allowed border border-gray-300 dark:border-brand-white/5' 
                            : 'bg-gradient-to-r from-brand-red to-brand-darkRed text-white hover:shadow-brand-red/30 border border-brand-red/50'
                        }`}
                >
                    {processing ? 'Processando...' : 'PROCESSAR E RENOMEAR'}
                </button>

                {/* Progress Bar */}
                {processing && (
                    <div className="w-full bg-gray-300 dark:bg-brand-black rounded-full h-4 overflow-hidden border border-gray-400 dark:border-brand-gray">
                        <div 
                            className="bg-brand-red h-full transition-all duration-300 shadow-[0_0_10px_rgba(187,47,33,0.5)]"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                )}

                {/* Logs */}
                {(logs.length > 0 || processing) && (
                    <section className="glass-panel rounded-2xl overflow-hidden border-l-4 border-l-brand-red">
                        <div 
                            className="p-4 bg-gray-200/80 dark:bg-brand-black/40 flex justify-between items-center cursor-pointer hover:bg-gray-300 dark:hover:bg-brand-black/60 transition"
                            onClick={() => setShowLog(!showLog)}
                        >
                            <h3 className="font-mono text-brand-red font-bold flex items-center text-sm">
                                <span className="mr-2">{'>'}_</span> TERMINAL LOG
                            </h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-brand-gray/50 px-2 py-1 rounded border border-gray-300 dark:border-transparent">{showLog ? 'Ocultar' : 'Expandir'}</span>
                        </div>
                        
                        {showLog && (
                            <div 
                                ref={logContainerRef}
                                className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1 bg-gray-100 dark:bg-brand-black/60"
                            >
                                {logs.map((log) => (
                                    <div key={log.id} className={`border-b border-gray-300 dark:border-brand-white/5 pb-1 last:border-0 
                                        ${log.type === 'success' ? 'text-green-600 dark:text-green-400' : 
                                          log.type === 'error' ? 'text-brand-red' : 'text-gray-700 dark:text-gray-300'}`}
                                    >
                                        <span className="opacity-40 mr-2 text-gray-500">[{log.time}]</span>
                                        {log.message}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Results */}
                {results.length > 0 && (
                    <section className="space-y-6 animate-fade-in-up">
                        <h2 className="text-2xl font-bold text-center mb-8 text-gray-900 dark:text-brand-white">Resultados</h2>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                            {/* Stats */}
                            <div className="p-4 rounded-xl bg-green-100 dark:bg-green-900/10 border border-green-300 dark:border-green-500/20 text-center glass-panel">
                                <div className="text-3xl font-bold text-green-600 dark:text-green-500">{matchedCount}</div>
                                <div className="text-sm text-green-700 dark:text-green-200/50 uppercase tracking-widest text-xs mt-1">Sucessos</div>
                            </div>
                            <div className={`p-4 rounded-xl border text-center glass-panel ${unmatchedCount > 0 ? 'bg-red-50 dark:bg-brand-red/10 border-red-200 dark:border-brand-red/30' : 'bg-gray-50 dark:bg-brand-gray/20 border-gray-200 dark:border-brand-white/5'}`}>
                                <div className={`text-3xl font-bold ${unmatchedCount > 0 ? 'text-brand-red' : 'text-gray-400 dark:text-gray-500'}`}>{unmatchedCount}</div>
                                <div className={`text-sm uppercase tracking-widest text-xs mt-1 ${unmatchedCount > 0 ? 'text-brand-red/70' : 'text-gray-500 dark:text-gray-600'}`}>Falhas</div>
                            </div>
                        </div>

                        {matchedCount > 0 && (
                            <button 
                                onClick={downloadZip}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 transition-all flex items-center justify-center gap-2 border border-green-500/30"
                            >
                                <span>⬇️</span> Baixar Arquivos (ZIP)
                            </button>
                        )}

                        <div className="space-y-3">
                            {results.map((result, idx) => (
                                <div 
                                    key={idx} 
                                    className={`p-4 rounded-xl border backdrop-blur-md transition-colors ${
                                        result.matched 
                                            ? 'bg-white/60 dark:bg-brand-gray/20 border-green-500/20 hover:border-green-500/40' 
                                            : 'bg-red-50 dark:bg-brand-red/5 border-red-200 dark:border-brand-red/20 hover:border-brand-red/40'
                                    }`}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            <span className="block text-[10px] uppercase tracking-wider opacity-50 mb-1">Original</span>
                                            {result.originalName}
                                        </div>
                                        {result.matched ? (
                                            <div className="text-sm text-green-600 dark:text-green-400 md:text-right font-medium">
                                                <span className="block text-[10px] uppercase tracking-wider opacity-50 mb-1 text-green-600/50 dark:text-green-500/50">Novo Nome</span>
                                                {result.newName}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-brand-red md:text-right italic">
                                                Sem correspondência encontrada
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <button 
                            onClick={resetAll}
                            className="w-full py-3 mt-4 border border-gray-300 dark:border-brand-gray bg-gray-100 dark:bg-brand-black/50 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-brand-red hover:bg-red-50 dark:hover:bg-brand-red/10 rounded-xl transition-all uppercase text-sm tracking-wider"
                        >
                            🔄 Iniciar Novo Processo
                        </button>
                    </section>
                )}
            </div>
        </div>
    );
};

export default App;