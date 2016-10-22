import {Beat} from './beat';
import {BeatFile} from './beatFile';
import {CartItem} from './cartItem';
import {Genre} from './genre';
import {Transaction} from './transaction';
import {TransactionItem} from './transactionItem';
import {User} from './user';
import {License} from './license';
import initializer from './initializer';

initializer.did('models', {
	Beat, BeatFile, CartItem, Genre, Transaction, TransactionItem, User, License
});

initializer.resolve();

export {Beat} from './beat';
export {BeatFile} from './beatFile';
export {CartItem} from './cartItem';
export {Genre} from './genre';
export {Transaction} from './transaction';
export {TransactionItem} from './transactionItem';
export {User} from './user';
export {License} from './license';