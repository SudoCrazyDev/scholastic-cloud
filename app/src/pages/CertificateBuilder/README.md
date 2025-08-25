# Certificate Builder

A modern, feature-rich certificate design tool built with React, TypeScript, and Framer Motion.

## Features

### 🎨 **Visual Design Tools**
- **Rich Text Elements**: Add and customize text with various fonts, sizes, colors, and alignments
- **Shape Library**: Rectangles, circles, triangles, stars, and more geometric shapes
- **Image Support**: Insert and manipulate images with object-fit controls
- **Icon Library**: Pre-built icons for common certificate elements

### 🖱️ **Interactive Interface**
- **Drag & Drop**: Intuitive element manipulation
- **Real-time Editing**: See changes as you make them
- **Multi-selection**: Select and edit multiple elements at once
- **Keyboard Shortcuts**: Ctrl+Z (undo), Ctrl+Y (redo), Delete (remove)

### 📐 **Professional Layout Tools**
- **Grid System**: Visual alignment guides
- **Snapping**: Automatic element alignment
- **Layering**: Control element stacking order
- **Transform Tools**: Resize, rotate, and position elements precisely

### 💾 **Data Management**
- **Auto-save**: Automatic saving of your work
- **Version History**: Undo/redo functionality
- **Export Options**: High-quality PDF export
- **Template System**: Save and reuse designs

### 🎯 **User Experience**
- **Responsive Design**: Works on all screen sizes
- **Smooth Animations**: Framer Motion-powered transitions
- **Modern UI**: Clean, intuitive interface
- **Accessibility**: Keyboard navigation and screen reader support

## Architecture

### Components Structure
```
CertificateBuilder/
├── CertificateBuilder.tsx          # Main component
├── CertificateBuilderDemo.tsx      # Demo/landing page
├── components/
│   ├── CertificateToolbar.tsx     # Top toolbar with controls
│   ├── ElementsPanel.tsx          # Left sidebar - element library
│   ├── LayersPanel.tsx            # Left sidebar - layer management
│   ├── PropertiesPanel.tsx        # Right sidebar - element properties
│   ├── CertificateCanvas.tsx      # Main canvas area
│   └── index.ts                   # Component exports
└── README.md                      # This file
```

### State Management
- **Local State**: Element properties, canvas settings, UI state
- **TanStack Query**: Server state management for certificates
- **History Stack**: Undo/redo functionality
- **URL State**: Certificate ID and routing

### Data Flow
1. **User Interaction** → Component State Update
2. **State Change** → Canvas Re-render
3. **Auto-save** → API Call (via TanStack Query)
4. **Success/Error** → Toast Notification

## Usage

### Basic Workflow
1. **Start New**: Navigate to `/certificate-builder`
2. **Add Elements**: Drag elements from the left panel to canvas
3. **Customize**: Use the right panel to adjust properties
4. **Arrange**: Drag, resize, and rotate elements as needed
5. **Save**: Click save button or use auto-save
6. **Export**: Generate PDF for printing or sharing

### Element Types

#### Text Elements
- **Content**: Editable text content
- **Font Properties**: Family, size, weight, style
- **Color & Alignment**: Text color and alignment options
- **Positioning**: X, Y coordinates with snapping

#### Shape Elements
- **Geometric Shapes**: Rectangle, circle, triangle, star
- **Fill & Stroke**: Background color and border
- **Transform**: Size, rotation, opacity
- **Layering**: Z-index control

#### Image Elements
- **Source**: URL or file upload
- **Object Fit**: Cover, contain, fill, none
- **Alt Text**: Accessibility support
- **Resizing**: Maintain aspect ratio

### Advanced Features

#### Grid & Snapping
- **Grid Display**: Visual alignment guides
- **Snap Points**: Automatic element alignment
- **Grid Size**: Configurable grid spacing
- **Toggle Controls**: Enable/disable as needed

#### Layer Management
- **Visibility**: Show/hide elements
- **Locking**: Prevent accidental changes
- **Reordering**: Change stacking order
- **Bulk Operations**: Multi-select actions

#### History & Undo
- **Action Tracking**: Every change is recorded
- **Undo/Redo**: Navigate through history
- **State Persistence**: Maintains work across sessions
- **Performance**: Efficient memory management

## API Integration

### Certificate Service
```typescript
// Create new certificate
const certificate = await createCertificate({
  title: "My Certificate",
  design_json: designData,
  institution_id: "123"
});

// Update existing certificate
const updated = await updateCertificate(certificateId, {
  title: "Updated Title",
  design_json: newDesignData
});

// Load certificate
const certificate = await getCertificate(certificateId);
```

### TanStack Query Hooks
```typescript
// List certificates
const { data: certificates } = useCertificates();

// Get single certificate
const { data: certificate } = useCertificate(id);

// Create certificate
const createMutation = useCreateCertificate();

// Update certificate
const updateMutation = useUpdateCertificate();
```

## Styling & Theming

### Design System
- **Color Palette**: Consistent color scheme
- **Typography**: Modern font stack
- **Spacing**: 8px grid system
- **Shadows**: Subtle depth indicators
- **Borders**: Clean, minimal borders

### Responsive Design
- **Mobile First**: Optimized for small screens
- **Breakpoints**: Tailwind CSS responsive classes
- **Touch Support**: Mobile-friendly interactions
- **Adaptive Layout**: Sidebar collapse on small screens

## Performance

### Optimization Strategies
- **React.memo**: Prevent unnecessary re-renders
- **useCallback**: Stable function references
- **useMemo**: Expensive computation caching
- **Lazy Loading**: Component code splitting
- **Virtual Scrolling**: Large list optimization

### Canvas Performance
- **Efficient Rendering**: Optimized element rendering
- **Event Delegation**: Reduced event listeners
- **Memory Management**: Proper cleanup and disposal
- **Throttling**: Smooth interaction handling

## Browser Support

### Modern Browsers
- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

### Required Features
- **ES6+**: Modern JavaScript support
- **CSS Grid**: Layout system
- **Canvas API**: HTML5 canvas support
- **File API**: File upload handling

## Development

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Key Dependencies
- **React 19**: UI library
- **TypeScript**: Type safety
- **Framer Motion**: Animations
- **TanStack Query**: Server state
- **Tailwind CSS**: Styling
- **Lucide React**: Icons

### Development Tools
- **ESLint**: Code quality
- **Prettier**: Code formatting
- **TypeScript**: Type checking
- **Vite**: Build tool

## Contributing

### Code Style
- **TypeScript**: Strict type checking
- **Functional Components**: React hooks pattern
- **Component Composition**: Reusable components
- **Error Handling**: Comprehensive error boundaries
- **Testing**: Unit and integration tests

### Architecture Principles
- **Single Responsibility**: Each component has one purpose
- **Composition over Inheritance**: Flexible component reuse
- **State Management**: Clear data flow patterns
- **Performance**: Optimize for user experience
- **Accessibility**: Inclusive design principles

## Future Enhancements

### Planned Features
- **Template Library**: Pre-built certificate templates
- **Collaboration**: Multi-user editing
- **Advanced Typography**: More font options
- **Image Filters**: Effects and adjustments
- **Print Preview**: WYSIWYG printing
- **Mobile App**: Native mobile experience

### Technical Improvements
- **WebGL Rendering**: Hardware acceleration
- **Offline Support**: Service worker caching
- **Real-time Sync**: WebSocket integration
- **Plugin System**: Extensible architecture
- **Performance Monitoring**: Analytics and metrics

## Support

### Documentation
- **API Reference**: Complete API documentation
- **Examples**: Sample certificates and use cases
- **Tutorials**: Step-by-step guides
- **FAQ**: Common questions and answers

### Community
- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Community support and ideas
- **Contributing Guide**: How to contribute
- **Code of Conduct**: Community standards

---

Built with ❤️ using modern web technologies for the best user experience.
