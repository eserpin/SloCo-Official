const pool = require('../config/db');
const find = async (token) => {
  const { rows } = await pool.query(`SELECT uses_left, created_at FROM download_tokens
    WHERE token = $1 AND created_at > NOW() - INTERVAL '10 days' AND uses_left > 0`, [token]);
  return rows[0];
};
const consume = async (token) => {
  const result = await pool.query(`UPDATE download_tokens SET uses_left = uses_left - 1
    WHERE token = $1 AND created_at > NOW() - INTERVAL '10 days' AND uses_left > 0
    RETURNING uses_left`, [token]);
  return result.rowCount > 0;
};
module.exports = { find, consume };
