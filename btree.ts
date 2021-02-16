import RoaringBitmap32 from 'roaring/RoaringBitmap32';

const MAX_NODE_SIZE = 32;
const MAX_LEAF_SIZE = 32;

type uint32 = number;
type BTreeElement<T> = BTreeLeaf<T> | BTreeNode<T>;
type SplitResult<T> = { medianKey: T, left: BTreeElement<T>, right: BTreeElement<T> };

class BTreeLeaf<T> {
  keys: T[];
  values: RoaringBitmap32[];

  constructor(keys: T[], values: RoaringBitmap32[]) {
    this.keys = keys;
    this.values = values;
  }

  insert(key: T, value: uint32): void {
    let bitmap = this.get(key);

    if (bitmap) {
      bitmap.add(value);
    } else {
      const i = this._findIndex(key);

      this.keys.splice(i, 0, key);
      this.values.splice(i, 0, new RoaringBitmap32([value]));
    }
  }

  get(key: T): RoaringBitmap32 | undefined {
    const i = this._findIndex(key) - 1;

    if (this.keys[i] == key)
      return this.values[i];
    else
      return undefined;
  }

  full(): boolean {
    return this.keys.length >= MAX_LEAF_SIZE;
  }

  split(): SplitResult<T> {
    const medianIdx = Math.floor(this.keys.length / 2);
    const medianKey = this.keys[medianIdx];
    const leftKeys  = this.keys.slice(0, medianIdx);
    const leftVals  = this.values.slice(0, medianIdx);
    const rightKeys = this.keys.slice(medianIdx);
    const rightVals = this.values.slice(medianIdx);

    return {
      medianKey,
      left: new BTreeLeaf(leftKeys, leftVals),
      right: new BTreeLeaf(rightKeys, rightVals)
    };
  }

  collectGt(accumulator: RoaringBitmap32, key: T): void {
    for (let i = this.keys.length - 1; i >= 0 && key > this.keys[i]; --i)
      accumulator.orInPlace(this.values[i]);
  }

  collectGte(accumulator: RoaringBitmap32, key: T): void {
    for (let i = this.keys.length - 1; i >= 0 && key >= this.keys[i]; --i)
      accumulator.orInPlace(this.values[i]);
  }

  collectLt(accumulator: RoaringBitmap32, key: T): void {
    for (let i = 0; i < this.keys.length && key < this.keys[i]; ++i)
      accumulator.orInPlace(this.values[i]);
  }

  collectLte(accumulator: RoaringBitmap32, key: T): void {
    for (let i = 0; i < this.keys.length && key <= this.keys[i]; ++i)
      accumulator.orInPlace(this.values[i]);
  }

  collectAll(accumulator: RoaringBitmap32): void {
    for (let i = 0; i < this.keys.length; ++i)
      accumulator.orInPlace(this.values[i]);
  }

  _findIndex(key: T): uint32 {
    let i = 0;

    for (; i < this.keys.length && key >= this.keys[i]; ++i)
      ;

    return i;
  }
}

class BTreeNode<T> {
  keys: T[];
  children: BTreeElement<T>[];
  covering: RoaringBitmap32;

  constructor(keys: T[], children: BTreeElement<T>[]) {
    this.keys = keys;
    this.children = children;
    this.covering = new RoaringBitmap32();

    for (let i = 0; i < this.children.length; ++i)
      this.children[i].collectAll(this.covering);
  }

  insert(key: T, value: uint32): void {
    const i = this._findChildIndex(key);

    if (this.children[i].full()) {
      const { medianKey, left, right } = this.children[i].split();

      this.keys.splice(i, 0, medianKey);
      this.children.splice(i + 1, 0, right);
      this.children[i] = left;
      this.insert(key, value);
    } else {
      this.covering.add(value);
      this.children[i].insert(key, value);
    }
  }

  get(key: T): RoaringBitmap32 | undefined {
    const i = this._findChildIndex(key);
    return this.children[i].get(key);
  }

  full(): boolean {
    return this.keys.length >= MAX_NODE_SIZE;
  }

  split(): SplitResult<T> {
    // Recall there is one more child and one fewer key.
    const medianIdx     = Math.floor(this.keys.length / 2);
    const medianKey     = this.keys[medianIdx];
    const leftKeys      = this.keys.slice(0, medianIdx);
    const leftChildren  = this.children.slice(0, medianIdx + 1);
    const rightKeys     = this.keys.slice(medianIdx + 1);
    const rightChildren = this.children.slice(medianIdx + 1);

    return {
      medianKey,
      left: new BTreeNode(leftKeys, leftChildren),
      right: new BTreeNode(rightKeys, rightChildren)
    };
  }

  collectGt(accumulator: RoaringBitmap32, key: T): void {
    let i = this.keys.length - 1;

    for (; i >= 0 && this.keys[i] > key; --i)
      this.children[i + 1].collectAll(accumulator);

    this.children[i + 1].collectGt(accumulator, key);
  }

  collectGte(accumulator: RoaringBitmap32, key: T): void {
    let i = this.keys.length - 1;

    for (; i >= 0 && this.keys[i] >= key; --i)
      this.children[i + 1].collectAll(accumulator);

    this.children[i + 1].collectGte(accumulator, key);
  }

  collectLt(accumulator: RoaringBitmap32, key: T): void {
    let i = 0;

    for (; i < this.keys.length && this.keys[i] < key; ++i)
      this.children[i].collectAll(accumulator);

    this.children[i].collectLt(accumulator, key);
  }

  collectLte(accumulator: RoaringBitmap32, key: T): void {
    let i = 0;

    for (; i < this.keys.length && this.keys[i] <= key; ++i)
      this.children[i].collectAll(accumulator);

    this.children[i].collectLte(accumulator, key);
  }

  collectAll(accumulator: RoaringBitmap32) {
    accumulator.orInPlace(this.covering);
  }

  _findChildIndex(key: T): uint32 {
    let i = 0;

    for (; i < this.keys.length && key >= this.keys[i]; ++i)
      ;

    return i;
  }
}

export default class BTree<T> {
  root: BTreeElement<T>;

  constructor() {
    this.root = new BTreeLeaf<T>([], []);
  }

  insert(key: T, value: uint32): void {
    if (this.root.full()) {
      const { medianKey, left, right } = this.root.split();

      this.root = new BTreeNode<T>([medianKey], [left, right]);

      this.insert(key, value);
    } else {
      this.root.insert(key, value);
    }
  }

  get(key: T): RoaringBitmap32 {
    return this.root.get(key);
  }

  gt(key: T): RoaringBitmap32 {
    const bitmap = new RoaringBitmap32();
    this.root.collectGt(bitmap, key);
    return bitmap;
  }

  gte(key: T): RoaringBitmap32 {
    const bitmap = new RoaringBitmap32();
    this.root.collectGte(bitmap, key);
    return bitmap;
  }

  lt(key: T): RoaringBitmap32 {
    const bitmap = new RoaringBitmap32();
    this.root.collectLt(bitmap, key);
    return bitmap;
  }

  lte(key: T): RoaringBitmap32 {
    const bitmap = new RoaringBitmap32();
    this.root.collectLte(bitmap, key);
    return bitmap;
  }
}
