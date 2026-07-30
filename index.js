if (body.type === 'confirmation') {
    const confirmationCode = process.env.VK_CONFIRMATION_CODE;
    console.log('Confirmation request! Returning:', confirmationCode);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(confirmationCode);
    return;
}
