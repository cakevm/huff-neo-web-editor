import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import './FileTree.css';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
  isOpen?: boolean;
}

interface FileTreeProps {
  files: FileNode[];
  selectedFile: string | null;
  onFileSelect: (file: FileNode) => void;
  onFileCreate: (parentId: string | null, name: string, type: 'file' | 'folder') => void;
  onFileDelete: (fileId: string) => void;
  onFileRename: (fileId: string, newName: string) => void;
  onToggleFolder: (folderId: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedFile,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  onToggleFolder,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(
    null
  );
  const [isCreating, setIsCreating] = useState<{
    parentId: string | null;
    type: 'file' | 'folder';
  } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  };

  const handleCreateNew = (type: 'file' | 'folder', parentId: string | null = null) => {
    setIsCreating({ parentId, type });
    setNewItemName('');
    setContextMenu(null);
  };

  const handleSubmitNew = () => {
    if (newItemName && isCreating) {
      onFileCreate(isCreating.parentId, newItemName, isCreating.type);
      setIsCreating(null);
      setNewItemName('');
    }
  };

  const handleRename = (node: FileNode) => {
    setRenamingId(node.id);
    setRenameValue(node.name);
    setContextMenu(null);
  };

  const handleSubmitRename = () => {
    if (renameValue && renamingId) {
      onFileRename(renamingId, renameValue);
      setRenamingId(null);
      setRenameValue('');
    }
  };

  const renderNode = (node: FileNode, level: number = 0): React.ReactElement => {
    const isSelected = selectedFile === node.id;
    const isRenaming = renamingId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`file-tree-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => (node.type === 'file' ? onFileSelect(node) : onToggleFolder(node.id))}
          onContextMenu={e => handleContextMenu(e, node.id)}
        >
          {node.type === 'folder' ? (
            node.isOpen ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : null}
          {node.type === 'folder' ? (
            node.isOpen ? (
              <FolderOpen size={16} />
            ) : (
              <Folder size={16} />
            )
          ) : (
            <File size={16} />
          )}
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleSubmitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSubmitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
              className="rename-input"
            />
          ) : (
            <span>{node.name}</span>
          )}
        </div>
        {node.type === 'folder' && node.isOpen && node.children && (
          <div>{node.children.map(child => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree" onClick={() => setContextMenu(null)}>
      <div className="file-tree-header">
        <span>Files</span>
        <div className="file-tree-actions">
          <button onClick={() => handleCreateNew('file')} title="New File">
            <File size={16} />
          </button>
          <button onClick={() => handleCreateNew('folder')} title="New Folder">
            <Folder size={16} />
          </button>
        </div>
      </div>

      <div className="file-tree-content">
        {files.map(node => renderNode(node))}

        {isCreating && (
          <div className="file-tree-item" style={{ paddingLeft: '8px' }}>
            {isCreating.type === 'folder' ? <Folder size={16} /> : <File size={16} />}
            <input
              type="text"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onBlur={() => setIsCreating(null)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSubmitNew();
                if (e.key === 'Escape') setIsCreating(null);
              }}
              placeholder={`New ${isCreating.type}...`}
              autoFocus
              className="rename-input"
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div
            onClick={() => {
              const node = findNode(files, contextMenu.nodeId);
              if (node) handleRename(node);
            }}
          >
            Rename
          </div>
          <div
            onClick={() => {
              onFileDelete(contextMenu.nodeId);
              setContextMenu(null);
            }}
          >
            Delete
          </div>
          {findNode(files, contextMenu.nodeId)?.type === 'folder' && (
            <>
              <div className="divider" />
              <div onClick={() => handleCreateNew('file', contextMenu.nodeId)}>New File</div>
              <div onClick={() => handleCreateNew('folder', contextMenu.nodeId)}>New Folder</div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

function findNode(nodes: FileNode[], id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
