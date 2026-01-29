export interface LogMessage {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface TableRow {
  nf: string | null;
  valor: number;
  valorFormatado: string;
  descricao: string;
  tipo?: string | null;
}

export interface ProcessingResult {
  originalName: string;
  newName: string;
  file: File;
  matched: boolean;
}

// Declare globals for the CDN libraries
declare global {
  interface Window {
    pdfjsLib: any;
    JSZip: any;
  }
}