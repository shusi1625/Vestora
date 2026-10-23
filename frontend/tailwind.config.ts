import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: '1rem',
				md: '1.5rem',
			},
			screens: {
				'2xl': '1280px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				/* 도메인 시맨틱 색: 청구 가능 / 예정 / 주의 / 무효 / 판매 중 / 테스트넷 */
				claimable: {
					DEFAULT: 'hsl(var(--claimable))',
					bg: 'hsl(var(--claimable-bg))',
					border: 'hsl(var(--claimable-border))'
				},
				scheduled: {
					DEFAULT: 'hsl(var(--scheduled))',
					bg: 'hsl(var(--scheduled-bg))',
					border: 'hsl(var(--scheduled-border))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					bg: 'hsl(var(--warning-bg))',
					border: 'hsl(var(--warning-border))'
				},
				void: {
					DEFAULT: 'hsl(var(--void))',
					bg: 'hsl(var(--void-bg))',
					border: 'hsl(var(--void-border))'
				},
				listed: {
					DEFAULT: 'hsl(var(--listed))',
					bg: 'hsl(var(--listed-bg))',
					border: 'hsl(var(--listed-border))'
				},
				testnet: {
					DEFAULT: 'hsl(var(--testnet))',
					bg: 'hsl(var(--testnet-bg))',
					border: 'hsl(var(--testnet-border))'
				},
				figure: {
					muted: 'hsl(var(--figure-muted))',
					stale: 'hsl(var(--figure-stale))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			fontFamily: {
				sans: [
					'Pretendard Variable',
					'Pretendard',
					'-apple-system',
					'BlinkMacSystemFont',
					'"Apple SD Gothic Neo"',
					'"Noto Sans KR"',
					'"Malgun Gothic"',
					'Roboto',
					'system-ui',
					'sans-serif'
				]
			},
			fontSize: {
				caption: ['11px', { lineHeight: '16px' }],
				'body-sm': ['13px', { lineHeight: '18px' }]
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			boxShadow: {
				card: 'var(--shadow-card)',
				dialog: 'var(--shadow-dialog)',
				floating: 'var(--shadow-floating)'
			},
			backgroundImage: {
				'gradient-surface': 'var(--gradient-surface)',
				'gradient-primary': 'var(--gradient-primary)'
			},
			transitionTimingFunction: {
				fast: 'cubic-bezier(0.4, 0, 0.2, 1)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'pulse-soft': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.45' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'pulse-soft': 'pulse-soft 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
