// Huff Compiler integration using huff-neo-js npm package
import { compile as wasmCompile, CompilerArtifact, SourceMapEntry } from 'huff-neo-js';

// Internal source map entry with converted coordinates for BytecodeViewer
export interface InternalSourceMapEntry {
  byte_offset: number; // Converted to hex character offset (pc * 2)
  length: number; // Converted to hex character length (bytecode_length * 2)
  source_start: number;
  source_end: number;
  description?: string;
}

// Result interface for our app
export interface CompileResult {
  success: boolean;
  bytecode?: string;
  runtime?: string;
  abi?: unknown;
  constructor_map?: InternalSourceMapEntry[];
  runtime_map?: InternalSourceMapEntry[];
  errors?: string[];
}

export class HuffCompiler {
  private isReady = false;

  async initialize() {
    try {
      // huff-neo-js is auto-initialized, no need for explicit init
      this.isReady = true;
    } catch (error) {
      console.error('Failed to initialize Huff compiler:', error);
      throw error;
    }
  }

  async compile(source: string, fileName: string = 'main.huff'): Promise<CompileResult> {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      // Prepare input for the WASM compiler
      const filesMap = new Map();
      filesMap.set(fileName, source);

      const input = {
        sources: [fileName],
        files: filesMap,
        evm_version: 'cancun', // Use latest EVM version
        construct_args: undefined,
        alternative_main: undefined,
        alternative_constructor: undefined,
      };

      // Call the WASM compiler - huff-neo-js expects an object
      const result = wasmCompile(input);

      if (result.errors && result.errors.length > 0) {
        return {
          success: false,
          errors: result.errors,
        };
      }

      // Extract the compiled contract
      const contracts = result.contracts;
      if (contracts) {
        // Check if contracts is a Map or Record
        const contractsMap: Map<string, CompilerArtifact> =
          contracts instanceof Map ? contracts : new Map(Object.entries(contracts));

        // Try to find the contract by different possible paths
        const possibleKeys = [fileName, `./${fileName}`, fileName.replace('.huff', '')];
        for (const key of possibleKeys) {
          const contract = contractsMap.get(key);
          if (contract) {
            // Convert new source map format to our internal format
            const constructor_map = contract.constructor_map?.map((entry: SourceMapEntry) => ({
              byte_offset: entry.pc * 2, // Convert byte offset to hex character offset
              length: entry.bytecode_length * 2, // Convert byte length to hex character length
              source_start: entry.source_start,
              source_end: entry.source_start + entry.source_length,
            }));
            const runtime_map = contract.runtime_map?.map((entry: SourceMapEntry) => ({
              byte_offset: entry.pc * 2, // Convert byte offset to hex character offset
              length: entry.bytecode_length * 2, // Convert byte length to hex character length
              source_start: entry.source_start,
              source_end: entry.source_start + entry.source_length,
            }));

            return {
              success: true,
              bytecode: contract.bytecode || contract.runtime || '0x',
              runtime: contract.runtime || contract.bytecode || '0x',
              abi: contract.abi || undefined,
              constructor_map,
              runtime_map,
            };
          }
        }

        // If there's any contract at all, use the first one
        if (contractsMap.size > 0) {
          const firstEntry = contractsMap.entries().next().value;
          if (firstEntry) {
            const [, contract] = firstEntry;
            // Convert new source map format to our internal format
            const constructor_map = contract.constructor_map?.map((entry: SourceMapEntry) => ({
              byte_offset: entry.pc * 2, // Convert byte offset to hex character offset
              length: entry.bytecode_length * 2, // Convert byte length to hex character length
              source_start: entry.source_start,
              source_end: entry.source_start + entry.source_length,
            }));
            const runtime_map = contract.runtime_map?.map((entry: SourceMapEntry) => ({
              byte_offset: entry.pc * 2, // Convert byte offset to hex character offset
              length: entry.bytecode_length * 2, // Convert byte length to hex character length
              source_start: entry.source_start,
              source_end: entry.source_start + entry.source_length,
            }));

            return {
              success: true,
              bytecode: contract.bytecode || contract.runtime || '0x',
              runtime: contract.runtime || contract.bytecode || '0x',
              abi: contract.abi || undefined,
              constructor_map,
              runtime_map,
            };
          }
        }
      }

      // If no contract found but no errors, this might be a compilation issue
      return {
        success: false,
        errors: ['No bytecode generated - check your Huff code for syntax errors'],
      };
    } catch (error) {
      console.error('Compilation error:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Compilation failed'],
      };
    }
  }

  formatBytecode(bytecode: string): string {
    // Remove 0x prefix if present
    let cleanBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;

    if (!cleanBytecode) return 'No bytecode generated';

    // Ensure even number of characters (complete bytes)
    if (cleanBytecode.length % 2 !== 0) {
      cleanBytecode = '0' + cleanBytecode;
    }

    return cleanBytecode;
  }

  analyzeBytecode(bytecode: string): {
    size: number;
    opcodes: number;
    pushData: number;
  } {
    const cleanBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
    const size = cleanBytecode.length / 2;

    // Simple analysis - count opcodes vs push data
    let opcodes = 0;
    let pushData = 0;
    let i = 0;

    while (i < cleanBytecode.length) {
      const opcode = cleanBytecode.substr(i, 2);
      const opcodeValue = parseInt(opcode, 16);

      opcodes++;
      i += 2;

      // Check for PUSH opcodes (0x60 to 0x7f)
      if (opcodeValue >= 0x60 && opcodeValue <= 0x7f) {
        const pushSize = (opcodeValue - 0x60 + 1) * 2;
        pushData += pushSize / 2;
        i += pushSize;
      }
    }

    return { size, opcodes, pushData };
  }
}

export const huffCompiler = new HuffCompiler();
