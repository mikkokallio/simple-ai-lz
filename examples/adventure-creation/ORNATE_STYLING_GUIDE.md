# Ornate Styling Guide

This guide documents the new ornate, medieval fantasy styling inspired by classic RPG UI design.

## Overview

The ornate styling system adds golden borders, decorative elements, and refined typography to give the application a premium fantasy RPG aesthetic reminiscent of games like Baldur's Gate 3.

## Button Variants

### Ornate Button
A special button variant with golden borders and hover effects:

```tsx
<Button variant="ornate" size="lg">
  <Icon weight="bold" /> Action
</Button>
```

**Features:**
- Golden gradient border (oklch colors: 0.65 0.15 40)
- Subtle hover glow effect
- Scale animation on hover
- Dark gradient background

## Modal/Dialog Styling

Modals now feature:
- **Ornate borders** with golden gradient
- **Backdrop blur** for depth
- **Title decoration** with golden underline divider
- **Enhanced shadows** with golden glow

```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="ornate">Open Modal</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Your Title</DialogTitle>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>
```

## Typography

### Golden Text
Apply golden gradient text effect:

```tsx
<h1 className="text-golden">Adventure Forge</h1>
```

### Animated Golden Shimmer
Add animated shimmer effect:

```tsx
<h1 className="text-golden text-golden-animated">Shimmering Title</h1>
```

### Typography Styles
- **H1**: 32px, bold, wide letter-spacing, gradient text
- **H2-H6**: Uppercase, bold, wide tracking, text shadow
- **Labels**: Semibold, uppercase, wide tracking

## Input Fields

Enhanced form inputs with:
- Rounded-lg borders (2px)
- Golden focus glow
- Card background with backdrop blur
- Increased height (h-10) for better touch targets

## Badge Components

New badge variant:

```tsx
<Badge variant="golden">Epic Item</Badge>
```

**Features:**
- Golden border
- Dark gradient background
- Enhanced shadow effects
- Uppercase bold text

## Decorative Elements

### Ornate Dividers
Horizontal dividers with golden accents:

```tsx
<div className="ornate-divider"></div>
```

With center decoration:
```tsx
<div className="ornate-divider ornate-divider-center"></div>
```

### Ornate Border
Add golden border to any element:

```tsx
<div className="ornate-border p-6">
  {/* Content */}
</div>
```

### Ornate Corners
Add corner decorations:

```tsx
<div className="ornate-corners p-6">
  {/* Content */}
</div>
```

## CSS Classes

### Available Classes
- `.ornate-border` - Golden gradient border with hover effect
- `.ornate-divider` - Horizontal golden divider line
- `.ornate-divider-center` - Adds center gem decoration
- `.text-golden` - Golden gradient text
- `.text-golden-animated` - Animated shimmer effect
- `.ornate-corners` - Corner decorations
- `.button-ornate-glow` - Button glow effect

## Color Palette

The ornate styling uses a golden color scheme:

- **Primary Golden**: `oklch(0.70 0.15 40)` - Text and icons
- **Golden Border**: `oklch(0.65 0.15 40)` - Borders and glows
- **Golden Accent**: `oklch(0.55 0.12 35)` - Secondary accents

## Usage Examples

### Complete Modal Example
```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="ornate" size="lg" className="gap-2">
      <Sparkle weight="fill" />
      Create Adventure
    </Button>
  </DialogTrigger>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>New Adventure</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Adventure Name</Label>
        <Input id="name" placeholder="Enter name..." />
      </div>
      <Button variant="ornate" className="w-full">
        Create
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

### Welcome Screen Example
```tsx
<div className="ornate-border fancy-card p-12 text-center">
  <div className="ornate-divider ornate-divider-center mb-8"></div>
  <h1 className="text-golden text-4xl mb-4">Welcome</h1>
  <p className="text-muted-foreground mb-8">
    Begin your epic journey
  </p>
  <Button variant="ornate" size="lg">
    Start Adventure
  </Button>
  <div className="ornate-divider ornate-divider-center mt-8"></div>
</div>
```

## Best Practices

1. **Use sparingly**: Ornate styling is best for primary actions and important UI elements
2. **Maintain hierarchy**: Use ornate variant for the most important buttons
3. **Consistency**: Apply golden text styling to major headings for brand consistency
4. **Accessibility**: Golden borders maintain WCAG AA contrast ratios
5. **Performance**: CSS animations use GPU-accelerated transforms

## Animations

All ornate elements include:
- **Smooth transitions** (300ms duration)
- **Hover effects** with scale and glow
- **GPU acceleration** for better performance
- **Reduced motion support** (respects user preferences)
