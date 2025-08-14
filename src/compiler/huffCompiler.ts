// Huff Compiler integration using huff-neo-js npm package
import { compile as wasmCompile, Contract } from 'huff-neo-js';

export interface SourceMapEntry {
  byte_offset: number;
  length: number;
  source_start: number;
  source_end: number;
  description?: string;
}

export interface CompileResult {
  success: boolean;
  bytecode?: string;
  runtime?: string;
  abi?: unknown;
  constructor_map?: SourceMapEntry[];
  runtime_map?: SourceMapEntry[];
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
      // Prepare input for the WASM compiler as JSON string
      const input = {
        sources: [fileName],
        files: {
          [fileName]: source,
        },
        evm_version: 'cancun', // Use latest EVM version
        construct_args: null,
        alternative_main: null,
        alternative_constructor: null,
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
        // The contracts is always a Map from huff-neo-js
        const contractsMap = contracts as Map<string, Contract>;

        // Try to find the contract by different possible paths
        const possibleKeys = [fileName, `./${fileName}`, fileName.replace('.huff', '')];
        for (const key of possibleKeys) {
          const contract = contractsMap.get(key);
          if (contract) {
            return {
              success: true,
              bytecode: contract.bytecode || contract.runtime || '0x',
              runtime: contract.runtime || contract.bytecode || '0x',
              abi: contract.abi || [],
              constructor_map: contract.constructor_map || undefined,
              runtime_map: contract.runtime_map || undefined,
            };
          }
        }

        // If there's any contract at all, use the first one
        if (contractsMap.size > 0) {
          const firstEntry = contractsMap.entries().next().value;
          if (firstEntry) {
            const [, contract] = firstEntry;
            return {
              success: true,
              bytecode: contract.bytecode || contract.runtime || '0x',
              runtime: contract.runtime || contract.bytecode || '0x',
              abi: contract.abi || [],
              constructor_map: contract.constructor_map || undefined,
              runtime_map: contract.runtime_map || undefined,
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
