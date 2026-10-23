"use client";
import type { ReactNode } from "react";
import { Button } from "../ui/primitives";
import type { VestoraController } from "../../hooks/use-vestora";
export type ServiceView = "market" | "assets" | "sales" | "payments" | "create" | "activity" | "detail";
export const serviceNavigation: [ServiceView,string][] = [["market","마켓플레이스"],["assets","내 자산"],["sales","내 판매"],["payments","지급 관리"],["activity","거래 내역"]];
export function ServiceShell({view,onNavigate,controller:c,children}: {view:ServiceView;onNavigate:(view:ServiceView)=>void;controller:VestoraController;children:ReactNode}) {
 return <div className="vestora"><a href="#service-main" className="v-skip">본문 바로가기</a><div className="v-shell">
 <aside className="v-sidebar"><div className="v-logo"><svg viewBox="0 0 30 32" aria-hidden="true"><path d="M3 4h8l7 24h-8z" fill="currentColor"/><path d="M18 4h9l-9 24-4-13z" fill="#8dac79"/></svg>vestora</div><nav aria-label="서비스 메뉴">{serviceNavigation.map(([key,label])=><button key={key} className="v-nav-item" aria-current={view===key||(view==="create"&&key==="payments")?"page":undefined} onClick={()=>onNavigate(key)}>{label}</button>)}</nav><p className="v-sidebar-note">Sepolia 테스트 서비스<br/>실제 화폐가 아닌 테스트 토큰을 사용합니다.</p></aside>
 <div><header className="v-header"><span>Sepolia · 테스트 자산</span><div className="v-inline">{c.isConnected?<><span className="v-muted">{c.address?.slice(0,6)}…{c.address?.slice(-4)}</span><Button onClick={()=>c.disconnect()}>연결 해제</Button></>:<Button variant="primary" disabled={c.isConnecting||!c.metaMaskConnector} onClick={()=>c.metaMaskConnector&&c.connect({connector:c.metaMaskConnector})}>{c.isConnecting?"연결 중":"지갑 연결"}</Button>}</div></header><main id="service-main" tabIndex={-1} className="v-main">{children}<footer className="v-service-footer"><span>데이터는 추정값이며 거래 시 온체인 조건을 확인합니다.</span><a href="/design-system">개발용 디자인 시스템</a></footer></main></div></div></div>;
}
