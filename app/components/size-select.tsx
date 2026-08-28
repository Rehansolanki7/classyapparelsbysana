"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type SizeSelectOption = {
  id: string | number;
  size: string;
  stock?: number;
};

export default function SizeSelect({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  options: SizeSelectOption[];
  onChange: (size: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const menuId = `size-select-${useId().replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.size === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, open]);

  function openMenu() {
    if (disabled || !options.length) return;
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function chooseOption(option: SizeSelectOption) {
    onChange(option.size);
    closeMenu(true);
  }

  function moveHighlight(direction: 1 | -1) {
    setHighlightedIndex((current) => (current + direction + options.length) % options.length);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseOption(options[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  return (
    <div ref={rootRef} className={`size-select-menu${open ? " open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="size-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        disabled={disabled || !options.length}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="size-select-current">
          {selectedOption?.size ?? "Select size"}
          {selectedOption && selectedOption.stock !== undefined && selectedOption.stock <= 2 && <small>{selectedOption.stock} left</small>}
        </span>
        <span className="size-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div id={menuId} className="size-select-popover" role="listbox" aria-label={label}>
        <div className="size-select-popover-heading">Choose a size</div>
        {options.map((option, index) => <div
          ref={(element) => { optionRefs.current[index] = element; }}
          key={option.id}
          id={`${menuId}-option-${index}`}
          className={`size-select-option${index === selectedIndex ? " selected" : ""}${index === highlightedIndex ? " highlighted" : ""}`}
          role="option"
          aria-selected={index === selectedIndex}
          tabIndex={index === highlightedIndex ? 0 : -1}
          onClick={() => chooseOption(option)}
          onKeyDown={(event) => handleOptionKeyDown(event, index)}
        >
          <span>{option.size}</span>
          {option.stock !== undefined && <small>{option.stock <= 2 ? `${option.stock} left` : "In stock"}</small>}
        </div>)}
      </div>}
    </div>
  );
}
