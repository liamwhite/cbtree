import RoaringBitmap32 from 'roaring/RoaringBitmap32';
import BTree from './btree';

type uint32 = number;

export default function quickSelect<T>(results: RoaringBitmap32, cardinality: uint32, sortField: BTree<T>, sortDocVals: Map<uint32, T>): uint32 {
  let pivotIndex = Math.floor(Math.random() * cardinality);
  let pivotValue = sortDocVals.get(results.select(pivotIndex));

  let leftResults = RoaringBitmap32.and(results, sortField.gt(pivotValue));
  cardinality = leftResults.size;

  if (cardinality == 0) {
    // All of these results are distinct
    return results.select(pivotIndex);
  } else {
    return quickSelect<T>(leftResults, cardinality, sortField, sortDocVals);
  }
}
