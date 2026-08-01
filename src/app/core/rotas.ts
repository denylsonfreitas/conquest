/**
 * Para onde o app leva alguém recém-autenticado.
 *
 * Existe como constante porque três lugares precisam concordar: o redirect da
 * rota raiz, o `visitanteGuard` (que tira o já-logado da tela de login) e o
 * `LoginComponent` depois de entrar. Como string solta, mudar a tela inicial
 * significaria caçar três ocorrências e esquecer uma.
 */
export const ROTA_INICIAL = '/concursos';
