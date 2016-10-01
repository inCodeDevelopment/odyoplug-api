export function wrap(handler) {
	return (req, res, next) => handler(req, res).asCallback(next);
}