import { lazy, Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Catalogo } from "./routes/Catalogo";
import { Produto } from "./routes/Produto";
import { CarrinhoPagina } from "./routes/Carrinho";
import { Checkout } from "./routes/Checkout";
import { Pedido } from "./routes/Pedido";
import { RetiradaPublica } from "./routes/RetiradaPublica";
import { MeusPedidos } from "./routes/MeusPedidos";
import { Pagina, Aviso, Carregando } from "./components/ui";

const Admin = lazy(() => import("./routes/Admin").then((modulo) => ({ default: modulo.Admin })));

function PaginaAdmin() {
  return <Suspense fallback={<Pagina><Carregando texto="Carregando o painel…" /></Pagina>}><Admin /></Suspense>;
}

const raiz = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <Pagina>
      <Aviso tipo="erro" titulo="Página não encontrada">
        O endereço que você abriu não existe.
      </Aviso>
    </Pagina>
  ),
});

const rotas = [
  createRoute({ getParentRoute: () => raiz, path: "/", component: Catalogo }),
  createRoute({ getParentRoute: () => raiz, path: "/produto/$slug", component: Produto }),
  createRoute({ getParentRoute: () => raiz, path: "/carrinho", component: CarrinhoPagina }),
  createRoute({ getParentRoute: () => raiz, path: "/checkout", component: Checkout }),
  createRoute({ getParentRoute: () => raiz, path: "/meus-pedidos", component: MeusPedidos }),
  createRoute({ getParentRoute: () => raiz, path: "/pedido/$token", component: Pedido }),
  createRoute({ getParentRoute: () => raiz, path: "/retirada/$token", component: RetiradaPublica }),
  createRoute({ getParentRoute: () => raiz, path: "/admin", component: PaginaAdmin }),
];

export const router = createRouter({ routeTree: raiz.addChildren(rotas) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
