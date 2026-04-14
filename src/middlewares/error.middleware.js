const errorMiddleware = (err, req, res, next) => {
  try {
    const method = req?.method || "";
    const url = req?.originalUrl || req?.url || "";
    process.stderr.write(
      `[error] ${method} ${url} -> ${err?.message || "Unknown error"}\n${err?.stack || ""}\n`
    );
  } catch (_) {
    // ignore logging failures
  }
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  return res.status(status).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && err.stack ? { stack: err.stack } : {}),
  });
};

module.exports = errorMiddleware;
