export function wrap(handler) {
	return (req, res, next) => handler(req, res)
		.then(() => {
			if (!req.stop) {
				next();
			}
		})
		.catch(next);
}
