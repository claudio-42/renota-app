import { TableRow } from '../types';

const OCR_API_KEY = 'K81805856488957';

type Logger = (message: string, type: 'info' | 'success' | 'error') => void;

export async function extractTextFromImage(file: File, log: Logger): Promise<string> {
    log('Processando tabela com OCR...', 'info');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'por');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');

    try {
        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (result.IsErroredOnProcessing) {
            throw new Error(result.ErrorMessage || 'Erro no OCR');
        }

        const ocrText = result.ParsedResults[0].ParsedText;
        log('OCR concluído.', 'success');
        return ocrText;
    } catch (error: any) {
        log(`Erro no OCR da tabela: ${error.message}`, 'error');
        throw error;
    }
}

export async function extractTextFromPDFWithOCR(file: File, log: Logger) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('apikey', OCR_API_KEY);
        formData.append('language', 'por');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');
        formData.append('filetype', 'PDF');

        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (result.IsErroredOnProcessing) {
            throw new Error(result.ErrorMessage || 'Erro no OCR do PDF');
        }

        const ocrText = result.ParsedResults[0].ParsedText;
        return ocrText;
    } catch (error: any) {
        log(`Erro no OCR do PDF: ${error.message}`, 'error');
        return '';
    }
}

export async function extractTextFromPDF(file: File, marketplace: string | null, log: Logger) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + ' ';
        }

        // Se for Magalu e o texto extraído estiver vazio ou muito pequeno, usar OCR
        if (marketplace === 'Magalu' && fullText.trim().length < 50) {
            log(`[Magalu] PDF parece ser imagem (texto extraído: ${fullText.trim().length} chars). Usando OCR...`, 'info');
            
            // Converter PDF para imagem e usar OCR
            const ocrText = await extractTextFromPDFWithOCR(file, log);
            
            if (ocrText && ocrText.length > 0) {
                log(`[Magalu] OCR concluído. ${ocrText.length} caracteres extraídos.`, 'success');
                return ocrText;
            } else {
                log(`[Magalu] OCR não retornou texto. Usando texto original.`, 'error');
                return fullText;
            }
        }

        return fullText;
    } catch (error: any) {
        log(`Erro ao ler PDF ${file.name}: ${error.message}`, 'error');
        return '';
    }
}

export function extractNFInfoFromPDF(pdfText: string, log: Logger) {
    // Verificar se é Nota de Débito
    const isNotaDebito = pdfText.toUpperCase().includes('NOTA DE DÉBITO') || 
                         pdfText.toUpperCase().includes('NOTA DE DEBITO');
    const tipo = isNotaDebito ? 'ND' : 'NFS';
    
    // Procurar número da nota com diferentes padrões
    const patterns = [
        /Número da Nota[\s:]*(\d+)/i,
        /Número Nota Fiscal[\s:]*(\d+)/i,
        /Nº da Nota[\s:]*(\d+)/i,
        /N[ºo]\.?\s*da Nota[\s:]*(\d+)/i,
        /Nota[\s:]*(\d{4,})/i  // Fallback: procurar "Nota" seguido de 4+ dígitos
    ];
    
    for (const pattern of patterns) {
        const match = pdfText.match(pattern);
        if (match && match[1]) {
            log(`✓ Número da nota encontrado: ${match[1]} (Tipo: ${tipo})`, 'info');
            return { nf: match[1], tipo: tipo };
        }
    }
    
    log('⚠️ Número da nota não encontrado no PDF', 'error');
    return { nf: null, tipo: tipo };
}

function parseTableTextShopee(text: string, log: Logger): TableRow[] {
    log('Analisando dados da tabela Shopee...', 'info');
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const data: TableRow[] = [];
    
    let descricoes: string[] = [];
    let numeros: string[] = [];
    let valores: { text: string, num: number }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.match(/^(NF-e|Número|Período de Serviço|Data de Emissão|Valor total)$/i)) {
            continue;
        }
        
        if (line.match(/^\d{7,9}$/)) {
            numeros.push(line);
            log(`Número: ${line}`, 'info');
            continue;
        }
        
        const valorMatch = line.match(/^R?\$?\s*([\d.]+,\d{2})$/);
        if (valorMatch) {
            const valorText = valorMatch[1];
            const valorNum = parseFloat(valorText.replace(/\./g, '').replace(',', '.'));
            valores.push({ text: valorText, num: valorNum });
            log(`Valor: R$ ${valorText}`, 'info');
            continue;
        }
        
        if (line.includes('-')) {
            let fullLine = line;
            
            if ((line.endsWith('-') || line.endsWith('- ')) && i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                if (!nextLine.match(/^\d{7,9}$/) && 
                    !nextLine.match(/^R?\$?\s*[\d.]+,\d{2}$/) &&
                    !nextLine.match(/^(NF-e|Número|Período de Serviço|Data de Emissão|Valor total)$/i)) {
                    fullLine = line + ' ' + nextLine;
                    i++; 
                    log(`Linha juntada: ${fullLine}`, 'info');
                }
            }
            
            let descricao = fullLine.trim();
            descricao = descricao.replace(/\s+\d{7,9}\s*$/, '').trim();
            
            const isJustDate = descricao.match(/^\d+\s+de\s+\w+\s*-?\s*\d*\s+de\s+\w+\s+de\s+\d{4}$/i);
            
            if (descricao.length > 5 && !isJustDate) {
                descricoes.push(descricao);
                log(`Descrição: ${descricao}`, 'info');
            }
        }
    }
    
    if (numeros.length === 0 || valores.length === 0) {
        log('⚠️ Não foi possível extrair números ou valores da tabela', 'error');
        return data;
    }
    
    const totalRegistros = Math.min(numeros.length, valores.length);
    
    for (let i = 0; i < totalRegistros; i++) {
        const descricao = i < descricoes.length ? descricoes[i] : 'Serviço';
        
        data.push({
            nf: numeros[i],
            valor: valores[i].num,
            valorFormatado: valores[i].text,
            descricao: descricao
        });
        
        log(`✓ Registro ${i+1}: NF ${numeros[i]} - ${descricao} - R$ ${valores[i].text}`, 'success');
    }
    
    return data;
}

function parseTableTextMercadoLivre(text: string, log: Logger): TableRow[] {
    log('Analisando dados da tabela Mercado Livre...', 'info');
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const data: TableRow[] = [];
    
    let descricoes: string[] = [];
    let numeros: string[] = [];
    let valores: { text: string, num: number }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.match(/^(Conceito de faturamento|Município|Número da NF-e|Total da fatura)$/i)) {
            continue;
        }
        
        if (line.match(/^0+\d+$/)) {
            const numero = line.replace(/^0+/, '');
            numeros.push(numero);
            log(`Número da NF-e: ${numero} (original: ${line})`, 'info');
            continue;
        }
        
        const valorMatch = line.match(/^R?\$?\s*([\d.]+,\d{2})$/);
        if (valorMatch) {
            const valorText = valorMatch[1];
            const valorNum = parseFloat(valorText.replace(/\./g, '').replace(',', '.'));
            valores.push({ text: valorText, num: valorNum });
            log(`Valor: R$ ${valorText}`, 'info');
            continue;
        }
        
        const municipiosComuns = /^(Curitiba|Osasco|São Paulo|Rio de Janeiro|Belo Horizonte|Governador Celso Ramos|Lauro de Freitas)$/i;
        
        if (!line.match(/^\d+$/) && 
            !line.match(/^R?\$?\s*[\d.]+,\d{2}$/) && 
            !municipiosComuns.test(line) &&
            !line.match(/^(Conceito de faturamento|Município|Número da NF-e|Total da fatura)$/i) &&
            line.length > 3) {
            
            descricoes.push(line);
            log(`Descrição (Conceito): ${line}`, 'info');
        }
    }
    
    if (numeros.length === 0 || valores.length === 0) {
        log('⚠️ Não foi possível extrair números ou valores da tabela', 'error');
        return data;
    }
    
    const totalRegistros = Math.min(numeros.length, valores.length);
    
    for (let i = 0; i < totalRegistros; i++) {
        const descricao = i < descricoes.length ? descricoes[i] : 'Serviço';
        
        data.push({
            nf: numeros[i],
            valor: valores[i].num,
            valorFormatado: valores[i].text,
            descricao: descricao
        });
        
        log(`✓ Registro ${i+1}: NF ${numeros[i]} - ${descricao} - R$ ${valores[i].text}`, 'success');
    }
    
    return data;
}

function parseTableTextMagalu(text: string, log: Logger): TableRow[] {
    log('Analisando dados da tabela Magalu...', 'info');
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const data: TableRow[] = [];
    
    let descricoes: string[] = [];
    let valores: { text: string, num: number }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.match(/^(Serviço prestado|Valor)/i)) {
            continue;
        }
        
        const valorMatch = line.match(/R?\$?\s*([\d.]+,\d{2})/i);
        if (valorMatch) {
            const valorText = valorMatch[1];
            const valorNum = parseFloat(valorText.replace(/\./g, '').replace(',', '.'));
            
            if (valorNum > 0) {
                valores.push({ text: valorText, num: valorNum });
                log(`Valor: R$ ${valorText}`, 'info');
                continue;
            }
        }
        
        if (!line.match(/^\d+$/) && 
            !line.match(/R?\$?\s*[\d.]+,\d{2}/i) && 
            !line.match(/^(Serviço prestado|Valor)/i) &&
            line.length > 2) {
            
            const cleanLine = line.replace(/[●•◆○J®©]/g, '').trim();
            if (cleanLine.length > 2) {
                descricoes.push(cleanLine);
                log(`Descrição (Serviço): ${cleanLine}`, 'info');
            }
        }
    }
    
    if (valores.length === 0) {
        log('⚠️ Não foi possível extrair valores da tabela.', 'error');
        return data;
    }
    
    const totalRegistros = valores.length;
    
    for (let i = 0; i < totalRegistros; i++) {
        const descricao = i < descricoes.length ? descricoes[i] : 'Serviço';
        
        data.push({
            nf: null,
            valor: valores[i].num,
            valorFormatado: valores[i].text,
            descricao: descricao,
            tipo: null
        });
        
        log(`✓ Registro ${i+1}: ${descricao} - R$ ${valores[i].text} (NF será extraída do PDF)`, 'success');
    }
    
    return data;
}

export function parseTableText(text: string, marketplace: string, log: Logger): TableRow[] {
    if (marketplace === 'Shopee') {
        return parseTableTextShopee(text, log);
    } else if (marketplace === 'Mercado Livre') {
        return parseTableTextMercadoLivre(text, log);
    } else if (marketplace === 'Magalu') {
        return parseTableTextMagalu(text, log);
    } else {
        log(`⚠️ Marketplace desconhecido: ${marketplace}`, 'error');
        return [];
    }
}

function findMatchingRowMagalu(pdfText: string, tableData: TableRow[], log: Logger): TableRow | null {
    log(`[Magalu Debug] Buscando valores dentro do PDF...`, 'info');
    
    const normalizedPdfText = pdfText.replace(/\s+/g, '').toUpperCase();
    
    for (const row of tableData) {
        const valorBase = row.valor.toFixed(2);
        const [inteiro, decimal] = valorBase.split('.');
        
        const valorFormats = [
            `R$${inteiro},${decimal}`,
            `R$ ${inteiro},${decimal}`,
            `R$${inteiro},${parseInt(decimal)}`,
            `R$ ${inteiro},${parseInt(decimal)}`,
            `R$${inteiro}.${decimal}`,
            `R$ ${inteiro}.${decimal}`,
            `R$${inteiro}.${parseInt(decimal)}`,
            `R$ ${inteiro}.${parseInt(decimal)}`,
            `${inteiro},${decimal}`,
            `${inteiro},${parseInt(decimal)}`,
            `${inteiro}.${decimal}`,
            `${inteiro}.${parseInt(decimal)}`,
            row.valorFormatado,
        ];
        
        let valorFound = false;
        let formatoEncontrado = '';
        
        for (const formato of valorFormats) {
            const normalized = formato.toString().replace(/\s+/g, '').toUpperCase();
            
            if (normalizedPdfText.includes(normalized)) {
                valorFound = true;
                formatoEncontrado = formato;
                break;
            }
        }
        
        if (valorFound) {
            const nfInfo = extractNFInfoFromPDF(pdfText, log);
            
            const updatedRow = {
                ...row,
                nf: nfInfo.nf || 'XXXX',
                tipo: nfInfo.tipo
            };
            
            log(`✓ Correspondência Magalu por Valor: R$ ${formatoEncontrado} - ${updatedRow.tipo} ${updatedRow.nf}`, 'success');
            return updatedRow;
        }
    }
    
    log(`[Magalu Debug] ✗ Nenhum valor da tabela OCR foi encontrado dentro do PDF`, 'error');
    return null;
}

export function findMatchingRow(pdfText: string, tableData: TableRow[], fileName: string, marketplace: string, log: Logger): TableRow | null {
    if (marketplace === 'Magalu') {
        return findMatchingRowMagalu(pdfText, tableData, log);
    }
    
    const normalizedPdfText = pdfText.replace(/\s+/g, ' ').toUpperCase();
    
    const fileNameNumbers = fileName.match(/\d{7,9}/g);
    if (fileNameNumbers) {
        for (const fileNum of fileNameNumbers) {
            const rowByFileName = tableData.find(row => row.nf === fileNum);
            if (rowByFileName) {
                log(`✓ Correspondência por nome do arquivo: ${fileNum}`, 'success');
                return rowByFileName;
            }
        }
    }
    
    for (const row of tableData) {
        if (!row.nf) continue;
        const nfFound = normalizedPdfText.includes(row.nf);
        
        if (nfFound) {
            const valorFormats = [
                row.valorFormatado,
                row.valor.toFixed(2).replace('.', ','),
                row.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
                row.valor.toString().replace('.', ','),
                row.valor.toFixed(2),
            ];
            
            let valorFound = false;
            let formatoEncontrado = '';
            
            for (const formato of valorFormats) {
                const normalized = formato.toString().replace(/\s+/g, '');
                if (normalizedPdfText.includes(normalized)) {
                    valorFound = true;
                    formatoEncontrado = formato;
                    break;
                }
            }
            
            if (valorFound) {
                log(`✓ Correspondência por Número + Valor: NF ${row.nf} + R$ ${formatoEncontrado}`, 'success');
                return row;
            }
        }
    }
    
    for (const row of tableData) {
        const valorFormats = [
            row.valorFormatado,
            row.valor.toFixed(2).replace('.', ','),
            row.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            row.valor.toString().replace('.', ','),
            row.valor.toFixed(2),
        ];
        
        let valorFound = false;
        let formatoEncontrado = '';
        
        for (const formato of valorFormats) {
            const normalized = formato.toString().replace(/\s+/g, '');
            if (normalizedPdfText.includes(normalized)) {
                valorFound = true;
                formatoEncontrado = formato;
                break;
            }
        }
        
        if (valorFound) {
            log(`⚠ Correspondência apenas por Valor: R$ ${formatoEncontrado} (NF: ${row.nf})`, 'info');
            return row;
        }
    }
    
    for (const row of tableData) {
        if (row.nf && normalizedPdfText.includes(row.nf)) {
            log(`⚠ Apenas número encontrado (sem valor): NF ${row.nf}`, 'info');
            return row;
        }
    }
    
    return null;
}