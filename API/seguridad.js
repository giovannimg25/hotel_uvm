const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const encriptarPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const compararPassword = async (password, passwordHash) => {
    return await bcrypt.compare(password, passwordHash);
};

const generarToken = (usuario) => {
    return jwt.sign(
        { id: usuario.id, email: usuario.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const verificarToken = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ msg: 'No hay token, permiso denegado' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (error) {
        res.status(401).json({ msg: 'Token no válido' });
    }
};

module.exports = {
    encriptarPassword,
    compararPassword,
    generarToken,
    verificarToken
};
