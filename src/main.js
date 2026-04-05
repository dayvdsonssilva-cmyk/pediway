// ==================== src/main.js ====================

console.log('🚀 PEDIWAY - Sistema iniciado com sucesso!');

document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 Página carregada - Tudo pronto');

    // Tela inicial
    document.body.innerHTML += `
        <div style="margin-top:50px;">
            <h2>Bem-vindo ao PEDIWAY</h2>
            <p style="margin:20px 0;">A estrutura básica está funcionando.</p>
            <button onclick="alert('Botão funcionando! 🎉')" 
                    style="padding:15px 30px; font-size:1.1rem; background:#E8410A; color:white; border:none; border-radius:8px; cursor:pointer;">
                Testar Botão
            </button>
        </div>
    `;
});
