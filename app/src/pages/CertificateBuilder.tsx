import React, { useState, useRef } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Download, Image, Type, Square } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Types
interface Element {
  id: string;
  type: 'text' | 'image' | 'shape';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
  };
}

interface PaperSettings {
  size: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
}

const PAPER_SIZES = {
  A4: { width: 794, height: 1123 },
  A3: { width: 1123, height: 1587 },
  Letter: { width: 816, height: 1056 },
  Legal: { width: 816, height: 1344 },
};

// Draggable Element Component
interface DraggableElementProps {
  element: Element;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  isDragging?: boolean;
  isSelected?: boolean;
  onResize?: (id: string, updates: Partial<Element>) => void;
}

const DraggableElement: React.FC<DraggableElementProps> = ({
  element,
  children,
  onClick,
  isDragging = false,
  isSelected = false,
  onResize,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({
    id: element.id,
  });

  const style = {
    position: 'absolute' as const,
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px) rotate(${element.rotation}deg)` : `rotate(${element.rotation}deg)`,
    cursor: 'move',
    opacity: isDragging ? 0.3 : 1,
    border: isDragging ? '2px dashed #3b82f6' : undefined,
    transition: 'opacity 0.2s, border 0.2s',
    boxSizing: 'border-box' as const,
  };

  // --- Resize logic ---
  const resizingRef = useRef<{ handle: string; startX: number; startY: number; startW: number; startH: number; startLeft: number; startTop: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: element.width,
      startH: element.height,
      startLeft: element.x,
      startTop: element.y,
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current || !onResize) return;
    const { handle, startX, startY, startW, startH, startLeft, startTop } = resizingRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newW = startW;
    let newH = startH;
    let newX = startLeft;
    let newY = startTop;

    switch (handle) {
      case 'nw':
        newW = Math.max(20, startW - dx);
        newH = Math.max(20, startH - dy);
        newX = startLeft + dx;
        newY = startTop + dy;
        break;
      case 'ne':
        newW = Math.max(20, startW + dx);
        newH = Math.max(20, startH - dy);
        newY = startTop + dy;
        break;
      case 'sw':
        newW = Math.max(20, startW - dx);
        newH = Math.max(20, startH + dy);
        newX = startLeft + dx;
        break;
      case 'se':
        newW = Math.max(20, startW + dx);
        newH = Math.max(20, startH + dy);
        break;
    }
    onResize(element.id, { width: newW, height: newH, x: newX, y: newY });
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  // --- Render corner handles if selected ---
  const handleSize = 12;
  const handleStyle = {
    position: 'absolute' as const,
    width: handleSize,
    height: handleSize,
    background: '#fff',
    border: '2px solid #3b82f6',
    borderRadius: 3,
    zIndex: 10,
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={e => { e.stopPropagation(); onClick(e); }}
    >
      {children}
      {isSelected && (
        <>
          {/* NW */}
          <div
            style={{ ...handleStyle, left: -handleSize/2, top: -handleSize/2, cursor: 'nwse-resize' }}
            onMouseDown={e => handleMouseDown(e, 'nw')}
          />
          {/* NE */}
          <div
            style={{ ...handleStyle, right: -handleSize/2, top: -handleSize/2, cursor: 'nesw-resize' }}
            onMouseDown={e => handleMouseDown(e, 'ne')}
          />
          {/* SW */}
          <div
            style={{ ...handleStyle, left: -handleSize/2, bottom: -handleSize/2, cursor: 'nesw-resize' }}
            onMouseDown={e => handleMouseDown(e, 'sw')}
          />
          {/* SE */}
          <div
            style={{ ...handleStyle, right: -handleSize/2, bottom: -handleSize/2, cursor: 'nwse-resize' }}
            onMouseDown={e => handleMouseDown(e, 'se')}
          />
        </>
      )}
    </div>
  );
};

const CertificateBuilder: React.FC = () => {
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [paperSettings, setPaperSettings] = useState<PaperSettings>({
    size: 'A4',
    orientation: 'portrait',
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [canvasBgColor, setCanvasBgColor] = useState<string>('#ffffff');
  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Calculate canvas dimensions based on paper settings
  const getCanvasDimensions = () => {
    const paperSize = PAPER_SIZES[paperSettings.size];
    const scale = 0.6; // Scale down for display
    
    if (paperSettings.orientation === 'landscape') {
      return {
        width: paperSize.height * scale,
        height: paperSize.width * scale,
      };
    }
    return {
      width: paperSize.width * scale,
      height: paperSize.height * scale,
    };
  };

  const canvasDimensions = getCanvasDimensions();

  // Add new element
  const addElement = (type: Element['type']) => {
    const newElement: Element = {
      id: Date.now().toString(),
      type,
      content: type === 'text' ? 'Sample Text' : type === 'image' ? '' : 'rectangle',
      x: canvasDimensions.width / 2 - 50,
      y: canvasDimensions.height / 2 - 25,
      width: type === 'text' ? 100 : 100,
      height: type === 'text' ? 30 : 100,
      rotation: 0,
      style: {
        fontSize: 16,
        fontFamily: 'Arial',
        color: '#000000',
        backgroundColor: type === 'shape' ? '#3b82f6' : 'transparent',
        borderColor: '#000000',
        borderWidth: 1,
      },
    };
    setElements([...elements, newElement]);
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    
    setElements((elements) =>
      elements.map((element) =>
        element.id === active.id
          ? {
              ...element,
              x: element.x + delta.x,
              y: element.y + delta.y,
            }
          : element
      )
    );
    setSelectedElement(active.id as string); // Keep the element selected after drag
    setActiveId(null);
  };

  // Update element properties
  const updateElement = (id: string, updates: Partial<Element>) => {
    setElements((elements) =>
      elements.map((element) =>
        element.id === id ? { ...element, ...updates } : element
      )
    );
  };

  // Delete element
  const deleteElement = (id: string) => {
    setElements((elements) => elements.filter((element) => element.id !== id));
    setSelectedElement(null);
  };

  // Generate PDF
  const generatePDF = async () => {
    if (!canvasRef.current) return;

    try {
      const canvas = await html2canvas(canvasRef.current, {
        useCORS: true,
        allowTaint: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const paperSize = PAPER_SIZES[paperSettings.size];
      
      let pdfWidth, pdfHeight;
      if (paperSettings.orientation === 'landscape') {
        pdfWidth = paperSize.height / 3.78; // Convert px to mm
        pdfHeight = paperSize.width / 3.78;
      } else {
        pdfWidth = paperSize.width / 3.78;
        pdfHeight = paperSize.height / 3.78;
      }

      const pdf = new jsPDF({
        orientation: paperSettings.orientation,
        unit: 'mm',
        format: [pdfWidth, pdfHeight],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('certificate.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  // Render element
  const renderElement = (element: Element) => {
    const isDragging = activeId === element.id;
    const isSelected = selectedElement === element.id;
    const elementContent = (() => {
      const commonStyle = {
        width: '100%',
        height: '100%',
        border: (isSelected || isDragging) ? '2px solid #3b82f6' : 'none',
        boxSizing: 'border-box' as const,
      };

      switch (element.type) {
        case 'text':
          return (
            <div
              style={{
                ...commonStyle,
                fontSize: element.style.fontSize,
                fontFamily: element.style.fontFamily,
                color: element.style.color,
                backgroundColor: element.style.backgroundColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
              }}
            >
              {element.content}
            </div>
          );
        
        case 'image':
          return (
            <div
              style={{
                ...commonStyle,
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed #d1d5db',
                overflow: 'hidden',
              }}
            >
              {element.content ? (
                <img
                  src={element.content}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  draggable={false}
                />
              ) : (
                <Image className="w-8 h-8 text-gray-400" />
              )}
            </div>
          );
        
        case 'shape':
          return (
            <div
              style={{
                ...commonStyle,
                backgroundColor: element.style.backgroundColor,
                border: `${element.style.borderWidth}px solid ${element.style.borderColor}`,
                borderRadius: element.content === 'circle' ? '50%' : '0',
              }}
            />
          );
        
        default:
          return null;
      }
    })();

    return (
      <DraggableElement 
        key={element.id}
        element={element} 
        onClick={() => setSelectedElement(element.id)}
        isDragging={isDragging}
        isSelected={isSelected}
        onResize={updateElement}
      >
        {elementContent}
      </DraggableElement>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Certificate Builder</h1>
          <button
            onClick={generatePDF}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 p-6 overflow-y-auto">
          {/* Paper Settings */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Paper Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paper Size
                </label>
                <select
                  value={paperSettings.size}
                  onChange={(e) => setPaperSettings(prev => ({ ...prev, size: e.target.value as PaperSettings['size'] }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="Letter">Letter</option>
                  <option value="Legal">Legal</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Orientation
                </label>
                <select
                  value={paperSettings.orientation}
                  onChange={(e) => setPaperSettings(prev => ({ ...prev, orientation: e.target.value as PaperSettings['orientation'] }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Page Background Color
                </label>
                <input
                  type="color"
                  value={canvasBgColor}
                  onChange={e => setCanvasBgColor(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent h-10"
                  style={{ padding: 0, minHeight: 0 }}
                />
              </div>
            </div>
          </div>

          {/* Elements */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Elements</h3>
            <div className="space-y-2">
              <button
                onClick={() => addElement('text')}
                className="w-full flex items-center px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Type className="w-5 h-5 mr-3 text-gray-600" />
                <span className="text-gray-900">Text</span>
              </button>
              <button
                onClick={() => addElement('image')}
                className="w-full flex items-center px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Image className="w-5 h-5 mr-3 text-gray-600" />
                <span className="text-gray-900">Image</span>
              </button>
              <button
                onClick={() => addElement('shape')}
                className="w-full flex items-center px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Square className="w-5 h-5 mr-3 text-gray-600" />
                <span className="text-gray-900">Shape</span>
              </button>
            </div>
          </div>

          {/* Properties Panel */}
          {selectedElement && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Properties</h3>
              {(() => {
                const element = elements.find(el => el.id === selectedElement);
                if (!element) return null;

                return (
                  <div className="space-y-4">
                    {element.type === 'text' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Text Content
                          </label>
                          <input
                            type="text"
                            value={element.content}
                            onChange={(e) => updateElement(element.id, { content: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Font Size
                          </label>
                          <input
                            type="number"
                            value={element.style.fontSize}
                            onChange={(e) => updateElement(element.id, { 
                              style: { ...element.style, fontSize: parseInt(e.target.value) }
                            })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Text Color
                          </label>
                          <input
                            type="color"
                            value={element.style.color}
                            onChange={(e) => updateElement(element.id, { 
                              style: { ...element.style, color: e.target.value }
                            })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </>
                    )}
                    {element.type === 'image' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Image URL
                          </label>
                          <input
                            type="text"
                            value={element.content}
                            onChange={e => updateElement(element.id, { content: e.target.value })}
                            placeholder="Paste image URL here"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </>
                    )}
                    {element.type === 'shape' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Shape Type
                          </label>
                          <select
                            value={element.content}
                            onChange={(e) => updateElement(element.id, { content: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="rectangle">Rectangle</option>
                            <option value="circle">Circle</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Fill Color
                          </label>
                          <input
                            type="color"
                            value={element.style.backgroundColor}
                            onChange={(e) => updateElement(element.id, { 
                              style: { ...element.style, backgroundColor: e.target.value }
                            })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Width
                        </label>
                        <input
                          type="number"
                          value={element.width}
                          onChange={(e) => updateElement(element.id, { width: parseInt(e.target.value) })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Height
                        </label>
                        <input
                          type="number"
                          value={element.height}
                          onChange={(e) => updateElement(element.id, { height: parseInt(e.target.value) })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => deleteElement(element.id)}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete Element
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="flex justify-center">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div
                ref={canvasRef}
                className="bg-white shadow-lg border border-gray-200 relative"
                style={{
                  width: canvasDimensions.width,
                  height: canvasDimensions.height,
                  background: canvasBgColor,
                }}
                onClick={() => setSelectedElement(null)}
              >
                {elements.map(renderElement)}
              </div>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateBuilder;