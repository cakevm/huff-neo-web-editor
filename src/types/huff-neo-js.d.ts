declare module 'huff-neo-js' {
  export interface SourceMapEntry {
    byte_offset: number;
    length: number;
    source_start: number;
    source_end: number;
    description?: string;
  }

  export interface CompilerInput {
    sources: string[];
    files: Record<string, string>;
    evm_version?: string;
    construct_args?: unknown;
    alternative_main?: string | null;
    alternative_constructor?: string | null;
  }

  export interface Contract {
    bytecode: string;
    runtime: string;
    abi: unknown[];
    constructor_map?: SourceMapEntry[];
    runtime_map?: SourceMapEntry[];
  }

  export interface CompilerOutput {
    errors?: string[];
    contracts?: Map<string, Contract>;
  }

  export function compile(input: CompilerInput): CompilerOutput;
}
