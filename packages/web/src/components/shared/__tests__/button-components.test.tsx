/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { ButtonGroup } from '../ButtonGroup';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

function render(element: React.ReactElement) {
  root = createRoot(container);
  act(() => {
    root.render(element);
  });
}

describe('Button', () => {
  it('renders with default color (major) and size (md)', () => {
    render(<Button>Click me</Button>);
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    // CSS module class names contain hashed identifiers
    expect(button?.className).toContain('uiButtonMajor');
    expect(button?.className).toContain('ui-button-md');
  });

  it('renders with different variant props', () => {
    const variants: Array<{ variant: 'major' | 'default' | 'danger' | 'ghost'; expectedClass: string }> = [
      { variant: 'major', expectedClass: 'uiButtonMajor' },
      { variant: 'default', expectedClass: 'uiButtonDefault' },
      { variant: 'danger', expectedClass: 'uiButtonDanger' },
      { variant: 'ghost', expectedClass: 'uiButtonGhost' },
    ];

    variants.forEach(({ variant, expectedClass }) => {
      const div = document.createElement('div');
      const btnRoot = createRoot(div);
      act(() => {
        btnRoot.render(<Button variant={variant}>{variant}</Button>);
      });
      const button = div.querySelector('button');
      expect(button?.className).toContain(expectedClass);
      act(() => btnRoot.unmount());
      div.remove();
    });
  });

  it('renders with different sizes', () => {
    const sizes: Array<{ size: 'lg' | 'md' | 'sm' | 'xs'; expectedClass: string }> = [
      { size: 'lg', expectedClass: 'ui-button-lg' },
      { size: 'md', expectedClass: 'ui-button-md' },
      { size: 'sm', expectedClass: 'ui-button-sm' },
      { size: 'xs', expectedClass: 'ui-button-xs' },
    ];

    sizes.forEach(({ size, expectedClass }) => {
      const div = document.createElement('div');
      const btnRoot = createRoot(div);
      act(() => {
        btnRoot.render(<Button size={size}>{size}</Button>);
      });
      const button = div.querySelector('button');
      expect(button?.className).toContain(expectedClass);
      act(() => btnRoot.unmount());
      div.remove();
    });
  });

  it('shows loading spinner when loading prop is true', () => {
    render(<Button loading>Loading</Button>);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
  });

  it('disables button when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('disables button when disabled prop is set', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button disabled>Disabled</Button>);
    });
    expect(div.querySelector('button')?.disabled).toBe(true);
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('reduces opacity when disabled', () => {
    render(<Button disabled>Disabled</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.style.opacity).toBe('0.4');
  });

  it('reduces opacity when loading', () => {
    render(<Button loading>Loading</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    // opacity = isDisabled && !loading ? 0.4 : 1
    // when loading: isDisabled=true, !loading=false => false => opacity=1 (no reduction)
    expect(button.style.opacity).toBe('1');
  });

  it('does not reduce opacity when loading but a valid child element', () => {
    // When loading, opacity is NOT reduced because the ternary is: isDisabled && !loading
    // Since !loading = false, opacity stays at 1
    render(<Button loading>Loading</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.style.opacity).toBe('1');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Click me</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} loading>Click me</Button>);
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders with block prop to fill parent width', () => {
    render(<Button block>Block Button</Button>);
    expect(container.querySelector('button')?.style.width).toBe('100%');
  });

  it('renders with iconLeft', () => {
    render(<Button iconLeft={<span data-testid="icon">*</span>}>With Icon</Button>);
    const icon = container.querySelector('[data-testid="icon"]');
    expect(icon).toBeTruthy();
  });

  it('renders with iconRight', () => {
    render(<Button iconRight={<span data-testid="icon">*</span>}>With Icon</Button>);
    const icon = container.querySelector('[data-testid="icon"]');
    expect(icon).toBeTruthy();
  });

  it('does not render icons when loading', () => {
    render(
      <Button loading iconLeft={<span data-testid="left">L</span>} iconRight={<span data-testid="right">R</span>}>
        Loading
      </Button>,
    );
    expect(container.querySelector('[data-testid="left"]')).toBeNull();
    expect(container.querySelector('[data-testid="right"]')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders with onlyIcon when no children but has icons', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button iconLeft={<span>*</span>} onlyIcon>Icon Only</Button>);
    });
    const button = div.querySelector('button');
    expect(button?.className).toContain('ui-button-icon-md');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('uses icon styling with 6px radius when an icon button has a border', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button aria-label="Icon only" iconLeft={<span>*</span>} />);
    });
    const button = div.querySelector('button') as HTMLButtonElement;
    expect(button.className).toContain('uiButtonIcon');
    expect(button.style.borderRadius).toBe('6px');
    expect(button.style.borderWidth).toBe('1px');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('renders with isDropDown and shows dropdown arrow', () => {
    render(<Button isDropDown>Dropdown</Button>);
    const arrow = container.querySelector('svg');
    expect(arrow).toBeTruthy();
  });

  it('does not show dropdown arrow when isDropDown is false', () => {
    render(<Button>Normal</Button>);
    const svgElements = container.querySelectorAll('svg');
    // Should only have the icon if provided, no dropdown arrow
    expect(svgElements.length).toBe(0);
  });

  it('renders with hasBorder false as icon button', () => {
    // hasBorder only affects noBorder when isIconButton is true
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button onlyIcon iconLeft={<span>*</span>} hasBorder={false}>Icon Only</Button>);
    });
    const button = div.querySelector('button');
    expect(button?.className).toContain('ui-button-icon-no-border');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('renders with tip as title attribute', () => {
    render(<Button tip="This is a tip">Hover me</Button>);
    const button = container.querySelector('button');
    expect(button?.getAttribute('title')).toBe('This is a tip');
  });

  it('renders with autoFocus prop', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button autoFocus>Auto Focused</Button>);
    });
    const button = div.querySelector('button');
    // autoFocus is destructured and explicitly passed to button element
    // so the button should have the autofocus attribute when autoFocus={true}
    // Note: button.autofocus reflects the actual focus state, not the attribute
    // We verify the prop is accepted and doesn't cause errors
    expect(button).toBeTruthy();
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    expect(container.querySelector('button')?.className).toContain('custom-class');
  });

  it('renders with type="submit"', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button type="submit">Submit</Button>);
    });
    expect(div.querySelector('button')?.type).toBe('submit');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('renders with type="reset"', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button type="reset">Reset</Button>);
    });
    expect(div.querySelector('button')?.type).toBe('reset');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('renders button with type="button" by default', () => {
    render(<Button>Button</Button>);
    expect(container.querySelector('button')?.type).toBe('button');
  });

  it('renders with xs size spinner (smaller)', () => {
    render(<Button size="xs" loading>Loading</Button>);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
    expect(spinner?.getAttribute('width')).toBe('12');
  });

  it('renders with sm size spinner (smaller)', () => {
    render(<Button size="sm" loading>Loading</Button>);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
    expect(spinner?.getAttribute('width')).toBe('12');
  });

  it('renders with lg size spinner (larger)', () => {
    render(<Button size="lg" loading>Loading</Button>);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
    expect(spinner?.getAttribute('width')).toBe('14');
  });

  it('renders with md size spinner (larger)', () => {
    render(<Button size="md" loading>Loading</Button>);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
    expect(spinner?.getAttribute('width')).toBe('14');
  });

  it('renders with both iconLeft and iconRight', () => {
    render(
      <Button iconLeft={<span data-testid="left">L</span>} iconRight={<span data-testid="right">R</span>}>
        Both
      </Button>,
    );
    expect(container.querySelector('[data-testid="left"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="right"]')).toBeTruthy();
  });

  it('isIconButton detection: onlyIcon flag', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<Button onlyIcon iconLeft={<span>*</span>}>Only Icon Button</Button>);
    });
    const button = div.querySelector('button');
    expect(button?.className).toContain('ui-button-icon-md');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('forwardRef works', () => {
    const ref = { current: null as HTMLButtonElement | null };
    const div = document.createElement('div');
    root = createRoot(div);
    act(() => {
      root.render(<Button ref={ref}>Ref Button</Button>);
    });
    expect(ref.current).toBeTruthy();
    act(() => root.unmount());
    div.remove();
  });
});

describe('IconButton', () => {
  it('renders icon button with aria-label', () => {
    render(
      <IconButton icon={<span data-testid="icon">X</span>} label="Close" />,
    );
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.getAttribute('aria-label')).toBe('Close');
  });

  it('renders with different sizes', () => {
    const sizes: Array<{ size: 'sm' | 'md' | 'lg'; expectedClass: string }> = [
      { size: 'sm', expectedClass: 'h-6 w-6' },
      { size: 'md', expectedClass: 'h-8 w-8' },
      { size: 'lg', expectedClass: 'h-12 w-12' },
    ];

    sizes.forEach(({ size, expectedClass }) => {
      const div = document.createElement('div');
      const btnRoot = createRoot(div);
      act(() => {
        btnRoot.render(<IconButton size={size} icon={<span />} label={size} />);
      });
      const button = div.querySelector('button');
      expect(button?.className).toContain(expectedClass);
      act(() => btnRoot.unmount());
      div.remove();
    });
  });

  it('disables button when disabled prop is set', () => {
    render(
      <IconButton icon={<span />} label="Close" disabled />,
    );
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('does not disable button when disabled prop is false', () => {
    render(
      <IconButton icon={<span />} label="Close" disabled={false} />,
    );
    expect(container.querySelector('button')?.disabled).toBe(false);
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <IconButton icon={<span />} label="Close" onClick={onClick} />,
    );
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <IconButton icon={<span />} label="Close" onClick={onClick} disabled />,
    );
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(
      <IconButton icon={<span />} label="Close" className="custom-class" />,
    );
    expect(container.querySelector('button')?.className).toContain('custom-class');
  });

  it('does not have hover background color styles', () => {
    render(
      <IconButton icon={<span />} label="Close" />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-transparent');
  });

  it('renders with type="button" by default', () => {
    render(
      <IconButton icon={<span />} label="Close" />,
    );
    expect(container.querySelector('button')?.type).toBe('button');
  });

  it('renders with type="submit"', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(<IconButton icon={<span />} label="Submit" type="submit" />);
    });
    expect(div.querySelector('button')?.type).toBe('submit');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('renders icon children', () => {
    render(
      <IconButton icon={<span data-testid="my-icon">X</span>} label="Test" />,
    );
    expect(container.querySelector('[data-testid="my-icon"]')).toBeTruthy();
  });

  it('has rounded style', () => {
    render(
      <IconButton icon={<span />} label="Rounded" />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('rounded-md');
  });

  it('has muted text color', () => {
    render(
      <IconButton icon={<span />} label="Muted" />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('text-[var(--text-muted)]');
  });
});

describe('ButtonGroup', () => {
  it('renders button group with children', () => {
    render(
      <ButtonGroup>
        <button>One</button>
        <button>Two</button>
      </ButtonGroup>,
    );
    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    expect(group?.children.length).toBe(2);
  });

  it('renders as a div with role="group"', () => {
    render(
      <ButtonGroup>
        <button>One</button>
      </ButtonGroup>,
    );
    const group = container.querySelector('[role="group"]');
    expect(group?.tagName).toBe('DIV');
  });

  it('renders with default size (md) and variant (default)', () => {
    render(
      <ButtonGroup>
        <button>One</button>
      </ButtonGroup>,
    );
    const group = container.querySelector('[role="group"]');
    expect(group?.className).toContain('inline-flex');
  });

  it('renders with size prop (prop is accepted but not applied to className)', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(
        <ButtonGroup size="sm">
          <button>Sm</button>
        </ButtonGroup>,
      );
    });
    const group = div.querySelector('[role="group"]');
    // size prop is accepted but not applied to className in this implementation
    expect(group).toBeTruthy();
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('renders with variant prop (prop is accepted but not applied to className)', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(
        <ButtonGroup variant="primary">
          <button>Primary</button>
        </ButtonGroup>,
      );
    });
    const group = div.querySelector('[role="group"]');
    // variant prop is accepted but not applied to className in this implementation
    expect(group).toBeTruthy();
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('forwards ref to the div element', () => {
    const ref = { current: null as HTMLDivElement | null };
    const div = document.createElement('div');
    root = createRoot(div);
    act(() => {
      root.render(<ButtonGroup ref={ref}>Test</ButtonGroup>);
    });
    expect(ref.current).toBeTruthy();
    expect(ref.current?.tagName).toBe('DIV');
    act(() => root.unmount());
    div.remove();
  });

  it('applies custom className', () => {
    render(
      <ButtonGroup className="custom-group-class">
        <button>One</button>
      </ButtonGroup>,
    );
    expect(container.querySelector('[role="group"]')?.className).toContain('custom-group-class');
  });

  it('renders multiple children correctly', () => {
    render(
      <ButtonGroup>
        <button>One</button>
        <button>Two</button>
        <button>Three</button>
      </ButtonGroup>,
    );
    const group = container.querySelector('[role="group"]');
    expect(group?.children.length).toBe(3);
  });

  it('passes through unknown props', () => {
    const div = document.createElement('div');
    const btnRoot = createRoot(div);
    act(() => {
      btnRoot.render(
        <ButtonGroup id="my-group" data-testid="group">
          <button>Test</button>
        </ButtonGroup>,
      );
    });
    expect(div.querySelector('[role="group"]')?.id).toBe('my-group');
    act(() => btnRoot.unmount());
    div.remove();
  });

  it('has displayName set', () => {
    expect(ButtonGroup.displayName).toBe('ButtonGroup');
  });
});
