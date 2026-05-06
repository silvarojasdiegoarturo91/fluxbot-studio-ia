---
name: ui-ux-generic
description: >-
  Expert in UI/UX design principles, patterns, and best practices. Use when creating
  user interfaces, designing user experiences, building forms, implementing navigation,
  creating onboarding flows, or improving usability. Covers design systems, accessibility,
  responsive design, interaction patterns, and design principles.
---

# UI/UX Design Expert

## When to Use This Skill

Use this skill when:
- Creating new user interfaces
- Designing user experiences
- Building form layouts
- Implementing navigation patterns
- Creating onboarding flows
- Improving usability and accessibility
- Designing empty states and error handling
- Building component libraries
- Evaluating UI/UX decisions

---

## Core Design Principles

### 1. Hierarchy of Needs
```
Functionality → Usability → Pleasure
```
- **Functionality**: Does it work?
- **Usability**: Can users figure out how to use it?
- **Pleasure**: Do users enjoy using it?

### 2. Progressive Disclosure
Don't overwhelm users:
- Show essential information first
- Reveal complexity gradually
- Provide context-sensitive help
- Allow expert shortcuts

### 3. Recognition Over Recall
- Make options visible
- Use familiar patterns
- Provide autocomplete
- Show recent items

### 4. Error Prevention > Error Recovery
- Validate inline
- Confirm destructive actions
- Provide sensible defaults
- Disable invalid actions

### 5. Consistency
- Internal: Same patterns throughout
- External: Match platform conventions
- Visual: Consistent spacing, colors, typography

---

## Layout Patterns

### Page Structure
```
┌─────────────────────────────────────┐
│  Header / Navigation Bar            │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────┬───────────────┐  │
│  │               │               │  │
│  │  Sidebar /   │    Main       │  │
│  │  Secondary   │    Content    │  │
│  │               │               │  │
│  └───────────────┴───────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  Footer / Action Bar                │
└─────────────────────────────────────┘
```

### Content Width
| Content Type | Max Width | Use Case |
|--------------|-----------|----------|
| Text | 65-75 characters | Readability |
| Forms | 600-800px | Usability |
| Images | 100% or fixed | Context |
| Dashboard | Fluid | Overview |

### Spacing System
```
Base unit: 4px / 8px

Scale:
0:   0px
1:   4px   - Tight inline
2:   8px   - Related elements
3:   12px  - Field gaps
4:   16px  - Standard padding
5:   20px  - Section padding
6:   24px  - Card padding
8:   32px  - Section gaps
10:  40px  - Major sections
12:  48px  - Page sections
16:  64px  - Hero spacing
```

---

## Form Design

### Best Practices

1. **Field Labels**
   - Position above input
   - Use clear, descriptive labels
   - Indicate required fields with asterisk
   - Use sentence case

2. **Input Fields**
   ```
   ┌─────────────────────────────┐
   │ Label                      │
   │ ┌─────────────────────────┐│
   │ │ Input field             ││
   │ └─────────────────────────┘│
   │ Help text / Error message  │
   └─────────────────────────────┘
   ```

3. **Field Grouping**
   - Group related fields
   - Use section headers
   - Logical flow (top-to-bottom, left-to-right)
   - Minimize vertical scrolling

4. **Validation**
   - Validate on blur, not on change
   - Show errors below field
   - Be specific in error messages
   - Prevent submission of invalid data

### Form Layout Patterns

**Single Column**
```
Label: [____________]
Label: [____________]
Label: [____________]
      [Submit]
```

**Two Column**
```
Label: [____]    Label: [____]
Label: [____]    Label: [____]
Label: [____________________]
              [Submit]
```

**Horizontal Form**
```
Label: [____] [____] [____] [Submit]
```

### Common Form Patterns

**Inline Validation**
```
✓ Email looks good
  Username: [______________]
  ✗ Username already taken
  
✓ Password meets requirements
  Password: [•••••••••]
```

**Floating Labels**
```
┌─────────────────────────┐
│                         │
│   Email                 │  ← Label floats up on focus
│   [___________________] │
│                         │
└─────────────────────────┘
```

---

## Navigation Patterns

### Primary Navigation
| Pattern | Use Case |
|---------|----------|
| Sidebar | Complex apps with many sections |
| Top bar | Simple apps, mobile |
| Tabs | Content switching within page |
| Breadcrumbs | Nested hierarchies |

### Navigation Principles
- Clear current location
- Easy access to main sections
- Consistent placement
- Visual affordance for interactivity

### Common Patterns

**Tab Navigation**
```
┌─────┬─────┬─────┬─────┐
│ Tab │ Tab │ Tab │ Tab │
├─────┴─────┴─────┴─────┤
│                       │
│     Content Area      │
│                       │
└───────────────────────┘
```

**Sidebar Navigation**
```
┌────────┬────────────────┐
│        │                │
│  Nav   │    Content     │
│  Item  │                │
│  Nav   │                │
│  Item  │                │
│  Nav   │                │
│  Item  │                │
│        │                │
└────────┴────────────────┘
```

---

## Onboarding Patterns

### 1. Welcome + Quick Setup
```
┌─────────────────────────────────────┐
│                                     │
│         [Welcome Icon/Image]        │
│                                     │
│      Welcome to [App Name]          │
│                                     │
│    Get started in just 2 minutes     │
│                                     │
│    [  Get Started  ]                │
│    [  Learn More  ]                 │
│                                     │
└─────────────────────────────────────┘
```

### 2. Checklist Pattern
```
┌─────────────────────────────────────┐
│  Welcome! Let's set up your         │
│  [App Name]                         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 1. Connect Store     [✓]    │   │
│  │ 2. Configure API     [→]    │   │
│  │ 3. First Setup       [→]    │   │
│  └─────────────────────────────┘   │
│                                     │
│    [Skip for now]    [Continue]     │
└─────────────────────────────────────┘
```

### 3. Step Wizard
```
┌─────────────────────────────────────┐
│         ●───○───○───○              │
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │     Step 2 of 4             │   │
│  │                             │   │
│  │     [Step Content]          │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│    [Back]              [Next →]     │
└─────────────────────────────────────┘
```

### 4. Tour/Tooltip
```
┌─────────────────────┐
│ Step 2: Settings    │
│                     │
│ Configure your      │
│ preferences here.   │
│                     │
│ [Skip] [Back] [Next]│
└─────────────────────┘
         ↓
    [Highlighted Element]
```

### Onboarding Rules
| Rule | Reason |
|------|--------|
| Max 5 steps | Prevent drop-off |
| Progress indicator | Set expectations |
| Allow skip | Respect user time |
| Persist state | Don't repeat work |
| Celebrate completion | Positive reinforcement |

---

## Empty States

### Purpose
- Explain what's missing
- Guide users to action
- Prevent confusion
- Reduce abandonment

### Components
```
┌─────────────────────────────────────┐
│                                     │
│         [Illustration]              │
│                                     │
│      No [items] yet                 │
│                                     │
│  Brief explanation of why and       │
│  what users should do.              │
│                                     │
│      [+ Add First Item]            │
│                                     │
└─────────────────────────────────────┘
```

### Types of Empty States

1. **User hasn't created anything**
   - Encouraging illustration
   - Clear value proposition
   - Single primary action

2. **No results (search/filter)**
   - Query entered by user
   - Suggest broadening search
   - Offer to clear filters

3. **Data deleted/unavailable**
   - Clear explanation
   - Recovery options if applicable
   - Contact support if not

---

## Error Handling

### Error Message Structure
```
┌─────────────────────────────────────┐
│ ⚠ Something went wrong             │
│                                     │
│ We couldn't save your changes.     │
│ Please check your connection and    │
│ try again.                          │
│                                     │
│ [Try Again]  [Contact Support]      │
└─────────────────────────────────────┘
```

### Error Categories

| Type | Response | Example |
|------|----------|---------|
| Validation | Inline, near field | "Email is required" |
| Form | Top of form | Banner + field highlights |
| Page | Full page error | "Something went wrong" |
| Toast | Transient | "Saved successfully" |

### Error Message Guidelines
- Be specific and helpful
- Explain what happened
- Suggest next steps
- Never blame the user
- Keep it concise

---

## Loading States

### Types

**Full Page**
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│            [Spinner]                │
│                                     │
│         Loading content...          │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

**Inline**
```
┌─────────────────────────────────────┐
│ ✓ Item 1                            │
│ ○ Item 2    [Loading...]            │
│ ○ Item 3                            │
└─────────────────────────────────────┘
```

**Skeleton**
```
┌─────────────────────────────────────┐
│ ┌──────┐  ┌────────────────────┐  │
│ │      │  │                    │  │
│ │ ▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │
│ │      │  │                    │  │
│ └──────┘  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │
│           │                    │  │
│           └────────────────────┘  │
└─────────────────────────────────────┘
```

### Loading Guidelines
- Show skeleton for content
- Show spinner for actions
- Show progress for uploads
- Minimum 300ms before showing loader
- Never leave user in limbo

---

## Feedback Patterns

### Success
```
┌─────────────────────────────────────┐
│ ✓ Changes saved successfully        │
│                                     │
│   [Dismiss]                         │
└─────────────────────────────────────┘
```

### Confirmation Dialog
```
┌─────────────────────────────────────┐
│         Confirm Action              │
│                                     │
│  Are you sure you want to delete   │
│  this item? This cannot be undone. │
│                                     │
│    [Cancel]    [Delete]             │
└─────────────────────────────────────┘
```

### Tooltip
```
        ┌─────────────────┐
        │ Additional info │
        │ about this      │
        │ element.        │
        └─────────────────┘
               ↓
┌─────────────────────────────┐
│  [ℹ️] Element with tooltip  │
└─────────────────────────────┘
```

---

## Responsive Design

### Breakpoints
```
Mobile:    < 640px
Tablet:    640px - 1024px
Desktop:   > 1024px
Large:     > 1440px
```

### Mobile Considerations
- Touch targets: minimum 44x44px
- Thumb-friendly navigation
- Reduced information density
- Swipe gestures
- Bottom sheets vs modals

### Responsive Patterns

**Stack to Side-by-Side**
```
Mobile:
┌─────────┐
│  Col 1  │
├─────────┤
│  Col 2  │
└─────────┘

Desktop:
┌─────────┬─────────┐
│  Col 1  │  Col 2  │
└─────────┴─────────┘
```

**Collapse Navigation**
```
Desktop:              Mobile:
[Logo] [Nav Items]    [Logo] [☰ Menu]
```

---

## Accessibility (a11y)

### WCAG 2.1 AA Requirements

| Requirement | Level |
|-------------|-------|
| Color contrast | 4.5:1 (text), 3:1 (large) |
| Focus visible | All interactive elements |
| Keyboard accessible | No mouse required |
| Screen reader | Proper labeling |
| Motion | Respect prefers-reduced-motion |

### Keyboard Navigation
```
Tab     → Next element
Shift+Tab → Previous element
Enter   → Activate
Space   → Toggle/check
Esc     → Close/cancel
Arrows  → Navigate within component
```

### ARIA Patterns
```html
<!-- Button -->
<button aria-label="Close dialog">✕</button>

<!-- Loading -->
<div aria-busy="true" aria-label="Loading">
  <Spinner />
</div>

<!-- Error -->
<input aria-invalid="true" aria-describedby="error-msg" />
<div id="error-msg">Email is required</div>

<!-- Expanded -->
<button aria-expanded="false" aria-controls="menu">
  Open Menu
</button>
<div id="menu" hidden>...</div>
```

---

## Interaction Design

### Micro-interactions

| Element | Interaction |
|---------|-------------|
| Button | Hover lift, press depress |
| Input | Focus ring, label float |
| Toggle | Smooth slide animation |
| Toast | Slide in/out |
| Modal | Fade + scale |
| List item | Hover highlight |

### Animation Guidelines
- Duration: 150-300ms
- Easing: ease-out for entering
- Avoid animation on reduced-motion
- Purpose > decoration

---

## Design Tokens

### Color System
```
Primary:    #0070f3 (actions, links)
Success:    #008060 (confirmations)
Warning:    #b98900 (caution)
Critical:   #d72b2b (errors)
Background: #f6f6f7 (light) / #1a1a1a (dark)
Text:       #202223 (primary) / #6d7175 (secondary)
```

### Typography Scale
```
Display:    32-48px, bold
Heading:    24-28px, semibold
Subhead:    18-20px, medium
Body:       14-16px, regular
Caption:    12px, regular
```

### Shadow
```
Subtle:  0 1px 2px rgba(0,0,0,0.05)
Medium:  0 4px 8px rgba(0,0,0,0.1)
Heavy:   0 8px 16px rgba(0,0,0,0.15)
```

---

## Component Guidelines

### Button Hierarchy
```
Primary   → Main action (1 per view)
Secondary → Alternative action
Tertiary  → Less important actions
Destructive → Dangerous actions
```

### Icon Usage
- Consistent style (outline/filled)
- 16px or 20px standard size
- Match text color
- Accessible labels

### Card Design
```
┌─────────────────────────────┐
│  Header (optional)          │
├─────────────────────────────┤
│                             │
│  Content                    │
│                             │
├─────────────────────────────┤
│  Footer / Actions (opt)     │
└─────────────────────────────┘
```

---

## Usability Checklist

### Before Launch
- [ ] All interactive elements work
- [ ] Form validation works correctly
- [ ] Error states are handled
- [ ] Loading states shown appropriately
- [ ] Empty states guide users
- [ ] Navigation is consistent
- [ ] Keyboard navigation works
- [ ] Screen reader tested
- [ ] Color contrast meets AA
- [ ] Mobile experience tested
- [ ] Touch targets adequate size
- [ ] Content readable on all screens
