import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.stubGlobal("matchMedia", vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})));

afterEach(cleanup);
