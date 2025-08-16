import React, { useState, useMemo } from 'react';
import { InternalSourceMapEntry } from '../compiler/huffCompiler';
import './BytecodeViewer.css';

interface BytecodeViewerProps {
  bytecode: string;
  sourceMap?: InternalSourceMapEntry[];
  source: string;
  onHover?: (sourceStart: number | null, sourceEnd: number | null) => void;
}

interface BytecodeSegment {
  offset: number;
  bytes: string;
  sourceStart?: number;
  sourceEnd?: number;
  description?: string;
}

export const BytecodeViewer: React.FC<BytecodeViewerProps> = ({
  bytecode,
  sourceMap,
  source,
  onHover,
}) => {
  const [hoveredSegment, setHoveredSegment] = useState<BytecodeSegment | null>(null);

  // Parse bytecode into segments based on source map
  const segments = useMemo(() => {
    const cleanBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
    const result: BytecodeSegment[] = [];

    if (!sourceMap || sourceMap.length === 0) {
      // No source map, treat as single segment
      return [
        {
          offset: 0,
          bytes: cleanBytecode,
        },
      ];
    }

    // Sort source map by byte offset
    const sortedMap = [...sourceMap].sort((a, b) => a.byte_offset - b.byte_offset);

    let lastOffset = 0;
    for (const entry of sortedMap) {
      // Add unmapped bytes before this entry
      if (entry.byte_offset > lastOffset) {
        result.push({
          offset: lastOffset,
          bytes: cleanBytecode.slice(lastOffset, entry.byte_offset),
        });
      }

      // Add mapped segment
      result.push({
        offset: entry.byte_offset,
        bytes: cleanBytecode.slice(entry.byte_offset, entry.byte_offset + entry.length),
        sourceStart: entry.source_start,
        sourceEnd: entry.source_end,
        description: entry.description,
      });

      lastOffset = entry.byte_offset + entry.length;
    }

    // Add any remaining unmapped bytes
    if (lastOffset < cleanBytecode.length) {
      result.push({
        offset: lastOffset,
        bytes: cleanBytecode.slice(lastOffset),
      });
    }

    return result;
  }, [bytecode, sourceMap]);

  const handleSegmentHover = (segment: BytecodeSegment | null) => {
    setHoveredSegment(segment);
    if (onHover) {
      if (segment && segment.sourceStart !== undefined && segment.sourceEnd !== undefined) {
        onHover(segment.sourceStart, segment.sourceEnd);
      } else {
        onHover(null, null);
      }
    }
  };

  // Parse opcodes and highlight PUSH instructions
  const parseOpcodes = (bytes: string): React.ReactElement[] => {
    const result: React.ReactElement[] = [];
    let i = 0;

    while (i < bytes.length) {
      const opcode = bytes.slice(i, i + 2);
      const opcodeValue = parseInt(opcode, 16);

      // Check if it's a PUSH instruction (0x60 to 0x7f)
      if (opcodeValue >= 0x60 && opcodeValue <= 0x7f) {
        const pushSize = opcodeValue - 0x60 + 1;
        const dataLength = pushSize * 2; // Each byte is 2 hex chars

        // Highlight PUSH opcode
        result.push(
          <span key={i} className="opcode-push">
            {opcode}
          </span>
        );
        i += 2;

        // Highlight PUSH data
        if (i < bytes.length) {
          const data = bytes.slice(i, Math.min(i + dataLength, bytes.length));
          result.push(
            <span key={i} className="opcode-push-data">
              {data}
            </span>
          );
          i += data.length;
        }
      } else {
        // Regular opcode
        result.push(
          <span key={i} className="opcode">
            {opcode}
          </span>
        );
        i += 2;
      }
    }

    return result;
  };

  return (
    <div className="bytecode-viewer">
      <div className="bytecode-segments">
        {segments.map((segment, index) => (
          <span
            key={index}
            className={`bytecode-segment ${segment.sourceStart !== undefined ? 'mapped' : 'unmapped'} ${
              hoveredSegment === segment ? 'hovered' : ''
            }`}
            onMouseEnter={() => handleSegmentHover(segment)}
            onMouseLeave={() => handleSegmentHover(null)}
            title={
              segment.description ||
              (segment.sourceStart !== undefined
                ? `Source: ${segment.sourceStart}-${segment.sourceEnd}`
                : 'No source mapping')
            }
          >
            {parseOpcodes(segment.bytes)}
          </span>
        ))}
      </div>

      {hoveredSegment && hoveredSegment.sourceStart !== undefined && (
        <div className="hover-info">
          <div className="hover-info-header">Bytecode Segment</div>
          <div className="hover-info-content">
            <div>Offset: 0x{hoveredSegment.offset.toString(16)}</div>
            <div>Length: {hoveredSegment.bytes.length / 2} bytes</div>
            {hoveredSegment.description && <div>Description: {hoveredSegment.description}</div>}
            <div>
              Source: chars {hoveredSegment.sourceStart}-
              {hoveredSegment.sourceEnd ? hoveredSegment.sourceEnd - 1 : 0}
            </div>
            <div className="source-preview">
              {source.substring(hoveredSegment.sourceStart, hoveredSegment.sourceEnd)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
