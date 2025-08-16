import { useState, useEffect, useRef, useMemo } from 'react';
import MonacoEditor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { FileTree, FileNode } from './components/FileTree';
import { BytecodeViewer } from './components/BytecodeViewer';
import { huffCompiler, CompileResult, InternalSourceMapEntry } from './compiler/huffCompiler';
import { huffLanguage, huffTheme } from './huffLanguage';
import { Play, AlertCircle, Info, FileText, Binary, Zap, ZapOff } from 'lucide-react';
import './App.css';

// Sample files for initial state
const initialFiles: FileNode[] = [
  {
    id: '1',
    name: 'SimpleStore.huff',
    type: 'file',
    content: `// Simple Storage Contract
#define constant VALUE_SLOT = FREE_STORAGE_POINTER()

// Interface
#define function setValue(uint256) nonpayable returns ()
#define function getValue() view returns (uint256)

// Store value
#define macro SET_VALUE() = takes(1) returns(0) {
    [VALUE_SLOT] sstore
}

// Load value  
#define macro GET_VALUE() = takes(0) returns(1) {
    [VALUE_SLOT] sload
}

// Main dispatch
#define macro MAIN() = takes(0) returns(0) {
    // Load function selector
    0x00 calldataload 0xe0 shr
    
    // Dispatch
    dup1 __FUNC_SIG(setValue) eq set_value jumpi
    dup1 __FUNC_SIG(getValue) eq get_value jumpi
    
    // Revert if no match
    0x00 0x00 revert
    
    set_value:
        0x04 calldataload
        SET_VALUE()
        stop
        
    get_value:
        GET_VALUE()
        0x00 mstore
        0x20 0x00 return
}`,
  },
  {
    id: '2',
    name: 'examples',
    type: 'folder',
    isOpen: true,
    children: [
      {
        id: '3',
        name: 'Counter.huff',
        type: 'file',
        content: `// Counter Contract
#define constant COUNTER = FREE_STORAGE_POINTER()

#define function increment() nonpayable returns ()
#define function getCount() view returns (uint256)

#define macro INCREMENT() = takes(0) returns(0) {
    [COUNTER] sload     // [count]
    0x01 add           // [count + 1]
    [COUNTER] sstore   // []
}

#define macro GET_COUNT() = takes(0) returns(1) {
    [COUNTER] sload    // [count]
}

#define macro MAIN() = takes(0) returns(0) {
    0x00 calldataload 0xe0 shr
    
    dup1 __FUNC_SIG(increment) eq increment jumpi
    dup1 __FUNC_SIG(getCount) eq get_count jumpi
    
    0x00 0x00 revert
    
    increment:
        INCREMENT()
        stop
        
    get_count:
        GET_COUNT()
        0x00 mstore
        0x20 0x00 return
}`,
      },
      {
        id: '4',
        name: 'MacroArgs.huff',
        type: 'file',
        content: `// First-class macro arguments example (v1.3.0)
#define macro ADD() = takes(2) returns(1) {
    add
}

#define macro MUL() = takes(2) returns(1) {
    mul
}

// Pass macro as argument
#define macro APPLY_OP(op) = takes(0) returns(1) {
    0x10
    0x20
    <op>()  // Invoke the macro passed as argument
}

#define macro MAIN() = takes(0) returns(0) {
    APPLY_OP(ADD)  // Results in: 0x10 + 0x20 = 0x30
    0x00 mstore
    0x20 0x00 return
}`,
      },
    ],
  },
];

function App() {
  const [files, setFiles] = useState<FileNode[]>(initialFiles);
  const [selectedFile, setSelectedFile] = useState<string | null>('1');
  const [currentContent, setCurrentContent] = useState<string>('');
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [editorInstance, setEditorInstance] = useState<monaco.editor.IStandaloneCodeEditor | null>(
    null
  );
  const [showRuntime, setShowRuntime] = useState(true);
  const [autoCompile, setAutoCompile] = useState(true);
  const decorationsRef = useRef<string[]>([]);

  // Initialize compiler
  useEffect(() => {
    huffCompiler.initialize().catch(err => {
      console.error('Failed to initialize compiler:', err);
    });
  }, []);

  // Load initial file content and compile on load
  useEffect(() => {
    if (selectedFile) {
      const file = findFileById(files, selectedFile);
      if (file && file.type === 'file') {
        setCurrentContent(file.content || '');
        // Auto-compile on file load (only if autoCompile is enabled)
        if (autoCompile && file.content) {
          handleCompileContent(file.content, file.name);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  // Auto-compile on content change with debounce (only if autoCompile is enabled)
  useEffect(() => {
    if (!autoCompile || !currentContent || !selectedFile) return;

    const file = findFileById(files, selectedFile);
    if (!file || file.type !== 'file') return;

    const timeoutId = window.setTimeout(() => {
      handleCompileContent(currentContent, file.name);
    }, 300); // 300ms debounce for faster updates

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContent, autoCompile]);

  const findFileById = (nodes: FileNode[], id: string): FileNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findFileById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const updateFileContent = (nodes: FileNode[], id: string, content: string): FileNode[] => {
    return nodes.map(node => {
      if (node.id === id) {
        return { ...node, content };
      }
      if (node.children) {
        return { ...node, children: updateFileContent(node.children, id, content) };
      }
      return node;
    });
  };

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'file') {
      // Save current content before switching
      if (selectedFile && currentContent !== undefined) {
        setFiles(prev => updateFileContent(prev, selectedFile, currentContent));
      }
      setSelectedFile(file.id);
    }
  };

  const handleContentChange = (value: string | undefined) => {
    setCurrentContent(value || '');
  };

  // Helper function to reconstruct bytecode map from constructor and runtime maps
  const reconstructBytecodeMap = (
    constructorMap?: InternalSourceMapEntry[],
    runtimeMap?: InternalSourceMapEntry[],
    constructorLength?: number
  ) => {
    if (!constructorMap && !runtimeMap) return undefined;

    const result = [];

    // Add constructor mappings as-is
    if (constructorMap) {
      result.push(...constructorMap);
    }

    // Add runtime mappings with adjusted offsets
    if (runtimeMap && constructorLength) {
      const adjustedRuntimeMap = runtimeMap.map(entry => ({
        ...entry,
        byte_offset: entry.byte_offset + constructorLength,
      }));
      result.push(...adjustedRuntimeMap);
    } else if (runtimeMap && !constructorLength) {
      // If no constructor, just use runtime map
      result.push(...runtimeMap);
    }

    return result.length > 0 ? result : undefined;
  };

  const handleCompileContent = async (content: string, fileName: string) => {
    if (!content.trim()) {
      setCompileResult(null);
      return;
    }

    setIsCompiling(true);
    try {
      const result = await huffCompiler.compile(content, fileName);
      setCompileResult(result);
    } catch (error) {
      console.error('Compilation error:', error);
      setCompileResult({
        success: false,
        errors: ['Compilation failed: ' + (error as Error).message],
      });
    } finally {
      setIsCompiling(false);
    }
  };

  const handleCompile = async () => {
    const file = findFileById(files, selectedFile || '');
    const fileName = file?.name || 'main.huff';
    await handleCompileContent(currentContent, fileName);
  };

  const handleFileCreate = (parentId: string | null, name: string, type: 'file' | 'folder') => {
    const newNode: FileNode = {
      id: Date.now().toString(),
      name: name.endsWith('.huff') || type === 'folder' ? name : `${name}.huff`,
      type,
      content: type === 'file' ? '// New Huff file\n' : undefined,
      children: type === 'folder' ? [] : undefined,
      isOpen: type === 'folder' ? true : undefined,
    };

    if (parentId) {
      setFiles(prev => addNodeToParent(prev, parentId, newNode));
    } else {
      setFiles(prev => [...prev, newNode]);
    }
  };

  const addNodeToParent = (nodes: FileNode[], parentId: string, newNode: FileNode): FileNode[] => {
    return nodes.map(node => {
      if (node.id === parentId && node.type === 'folder') {
        return {
          ...node,
          children: [...(node.children || []), newNode],
          isOpen: true,
        };
      }
      if (node.children) {
        return { ...node, children: addNodeToParent(node.children, parentId, newNode) };
      }
      return node;
    });
  };

  const handleFileDelete = (fileId: string) => {
    setFiles(prev => deleteNode(prev, fileId));
    if (selectedFile === fileId) {
      setSelectedFile(null);
      setCurrentContent('');
    }
  };

  const deleteNode = (nodes: FileNode[], id: string): FileNode[] => {
    return nodes.filter(node => {
      if (node.id === id) return false;
      if (node.children) {
        node.children = deleteNode(node.children, id);
      }
      return true;
    });
  };

  const handleFileRename = (fileId: string, newName: string) => {
    setFiles(prev => renameNode(prev, fileId, newName));
  };

  const renameNode = (nodes: FileNode[], id: string, newName: string): FileNode[] => {
    return nodes.map(node => {
      if (node.id === id) {
        return { ...node, name: newName };
      }
      if (node.children) {
        return { ...node, children: renameNode(node.children, id, newName) };
      }
      return node;
    });
  };

  const handleToggleFolder = (folderId: string) => {
    setFiles(prev => toggleFolder(prev, folderId));
  };

  const toggleFolder = (nodes: FileNode[], id: string): FileNode[] => {
    return nodes.map(node => {
      if (node.id === id && node.type === 'folder') {
        return { ...node, isOpen: !node.isOpen };
      }
      if (node.children) {
        return { ...node, children: toggleFolder(node.children, id) };
      }
      return node;
    });
  };

  const handleEditorWillMount = (monaco: typeof import('monaco-editor')) => {
    // Register Huff language
    monaco.languages.register({ id: 'huff' });
    monaco.languages.setMonarchTokensProvider('huff', huffLanguage);
    monaco.editor.defineTheme('huff-theme', huffTheme);
  };

  const handleEditorDidMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor')
  ) => {
    setEditorInstance(editor);
    // Set keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Save current file
      if (selectedFile) {
        setFiles(prev => updateFileContent(prev, selectedFile, currentContent));
      }
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleCompile();
    });
  };

  // Memoize the current source map to prevent unnecessary re-renders
  const currentSourceMap = useMemo(() => {
    if (!compileResult?.success) return undefined;

    return showRuntime
      ? compileResult.runtime_map
      : reconstructBytecodeMap(
          compileResult.constructor_map,
          compileResult.runtime_map,
          compileResult.bytecode && compileResult.runtime
            ? compileResult.bytecode.length - compileResult.runtime.length
            : 0
        );
  }, [compileResult, showRuntime]);

  // Memoize the current bytecode to prevent unnecessary re-renders
  const currentBytecode = useMemo(() => {
    if (!compileResult?.success) return '';
    return (showRuntime ? compileResult.runtime : compileResult.bytecode) || '';
  }, [compileResult, showRuntime]);

  const handleBytecodeHover = (sourceStart: number | null, sourceEnd: number | null) => {
    if (!editorInstance) return;

    // Clear previous decorations
    if (decorationsRef.current.length > 0) {
      editorInstance.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = [];
    }

    if (sourceStart !== null && sourceEnd !== null) {
      // Convert character positions to line/column
      const model = editorInstance.getModel();
      if (!model) return;

      const startPos = model.getPositionAt(sourceStart);
      const endPos = model.getPositionAt(sourceEnd);

      // Add new decoration
      const newDecorations = editorInstance.deltaDecorations(
        [],
        [
          {
            range: {
              startLineNumber: startPos.lineNumber,
              startColumn: startPos.column,
              endLineNumber: endPos.lineNumber,
              endColumn: endPos.column,
            },
            options: {
              className: 'source-highlight',
              inlineClassName: 'source-highlight-inline',
              isWholeLine: false,
            },
          },
        ]
      );

      decorationsRef.current = newDecorations;

      // Auto-scroll to the highlighted range
      editorInstance.revealLineInCenter(startPos.lineNumber);

      // Optional: Also ensure the specific position is visible
      editorInstance.revealPositionInCenter(startPos);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>Huff Neo Compiler</h1>
          <span className="version">v1.3.0</span>
        </div>
        <div className="header-right">
          <button
            className={`auto-compile-toggle ${autoCompile ? 'active' : ''}`}
            onClick={() => setAutoCompile(!autoCompile)}
            title={autoCompile ? 'Disable auto-compilation' : 'Enable auto-compilation'}
          >
            {autoCompile ? <Zap size={16} /> : <ZapOff size={16} />}
            Auto
          </button>
          {!autoCompile && (
            <button
              className="compile-btn"
              onClick={handleCompile}
              disabled={isCompiling || !selectedFile}
            >
              <Play size={16} />
              {isCompiling ? 'Compiling...' : 'Compile'}
            </button>
          )}
        </div>
      </div>

      <div className="main-content">
        <Allotment>
          <Allotment.Pane minSize={200} preferredSize={250}>
            <FileTree
              files={files}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              onFileCreate={handleFileCreate}
              onFileDelete={handleFileDelete}
              onFileRename={handleFileRename}
              onToggleFolder={handleToggleFolder}
            />
          </Allotment.Pane>

          <Allotment.Pane>
            <Allotment>
              <Allotment.Pane minSize={400}>
                <div className="editor-container">
                  {selectedFile ? (
                    <>
                      <div className="editor-header">
                        <FileText size={14} />
                        <span>{findFileById(files, selectedFile)?.name || 'Untitled'}</span>
                      </div>
                      <MonacoEditor
                        height="calc(100% - 32px)"
                        language="huff"
                        theme="huff-theme"
                        value={currentContent}
                        onChange={handleContentChange}
                        beforeMount={handleEditorWillMount}
                        onMount={handleEditorDidMount}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          wordWrap: 'on',
                          automaticLayout: true,
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </>
                  ) : (
                    <div className="no-file-selected">
                      <Info size={48} />
                      <p>Select a file to edit</p>
                    </div>
                  )}
                </div>
              </Allotment.Pane>

              <Allotment.Pane>
                <div className="output-container">
                  <div className="output-header">
                    <div>
                      <Binary size={14} />
                      <span>{showRuntime ? 'Runtime' : 'Bytecode'} Output</span>
                    </div>
                    {compileResult?.success && (
                      <div className="output-toggle">
                        <span className={`toggle-label-left ${!showRuntime ? 'active' : ''}`}>
                          Bytecode
                        </span>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={showRuntime}
                            onChange={e => setShowRuntime(e.target.checked)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                        <span className={`toggle-label-right ${showRuntime ? 'active' : ''}`}>
                          Runtime
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="output-content">
                    {compileResult ? (
                      compileResult.success ? (
                        <>
                          <div className="bytecode-stats">
                            {currentBytecode && (
                              <>
                                <span>Size: {(currentBytecode.length || 2 - 2) / 2} bytes</span>
                                <span>•</span>
                                <span>Length: {(currentBytecode.length || 2) - 2} chars</span>
                                {currentSourceMap && (
                                  <>
                                    <span>•</span>
                                    <span>Source mappings: {currentSourceMap.length || 0}</span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                          <BytecodeViewer
                            bytecode={currentBytecode}
                            sourceMap={currentSourceMap}
                            source={currentContent}
                            onHover={handleBytecodeHover}
                          />
                        </>
                      ) : (
                        <div className="compile-errors">
                          <AlertCircle size={20} />
                          <h3>Compilation Errors:</h3>
                          {compileResult.errors?.map((error, i) => (
                            <div key={i} className="error-message">
                              {error}
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="no-output">
                        <Info size={32} />
                        <p>
                          {autoCompile
                            ? 'Code automatically compiles as you type'
                            : 'Press Compile (Cmd+Enter) to generate bytecode'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}

export default App;
