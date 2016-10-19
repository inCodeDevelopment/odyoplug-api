import {Beat, postLoad as beatPostLoad} from './beat';
import {BeatFile} from './beatFile';
import {CartItem, postLoad as cartItemPostLoad} from './cartItem';
import {Genre} from './genre';
import {Transaction, postLoad as transactionPostLoad} from './transaction';
import {TransactionItem, postLoad as transactionItemPostLoad} from './transactionItem';
import {User, postLoad as userPostLoad} from './user';

const models = {
	Beat, BeatFile, CartItem, Genre, Transaction, TransactionItem, User
};

beatPostLoad(models);
cartItemPostLoad(models);
transactionPostLoad(models);
transactionItemPostLoad(models);
userPostLoad(models);

export {Beat} from './beat';
export {BeatFile} from './beatFile';
export {CartItem} from './cartItem';
export {Genre} from './genre';
export {Transaction} from './transaction';
export {TransactionItem} from './transactionItem';
export {User} from './user';