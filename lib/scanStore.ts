// Simple global store to pass scan results back to food-form
type ScanResult = {
  ingredientId: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  userEdited: boolean;
  portionEaten: string;
};

let _result: ScanResult | null = null;
let _listener: ((result: ScanResult) => void) | null = null;

export const scanStore = {
  setResult(result: ScanResult) {
    _result = result;
    _listener?.(result);
  },
  getResult(): ScanResult | null {
    return _result;
  },
  clearResult() {
    _result = null;
  },
  onResult(fn: (result: ScanResult) => void) {
    _listener = fn;
    return () => { _listener = null; };
  },
};
