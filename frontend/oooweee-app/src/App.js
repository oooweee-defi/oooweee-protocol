import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEETokenABI, OOOWEEESavingsABI, OOOWEEEValidatorFundABI, OOOWEEEStabilityABI, DonorRegistryABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { Web3Auth } from "@web3auth/modal";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";

// Uniswap Router ABI (minimal)
const UNISWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)",
  "function getAmountsIn(uint amountOut, address[] calldata path) public view returns (uint[] memory amounts)",
  "function WETH() external pure returns (address)"
];

// Contract addresses
const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

// ADMIN WALLET - Update this to your operations wallet address
const ADMIN_WALLET = "0xB05F42B174E5152d34431eE4504210932ddfE715";

// Web3Auth configuration
const WEB3AUTH_CLIENT_ID = "BBELIcLUxA8LFzE-ux8CxUpyKoojLwasmixNSEtqLcPFv7KUnRWKmM-C0PQFtWXy-cv8iHxDebZ4uiJkHEnBLSs";

// Transak fiat onramp configuration
const TRANSAK_API_KEY = "5606035c-b59a-4c73-80f0-b9930cdfd9f9";
const SEPOLIA_CHAIN_CONFIG = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7",
  rpcTarget: "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
  displayName: "Ethereum Sepolia",
  blockExplorerUrl: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  decimals: 18,
  isTestnet: true,
};

// Currency configuration - USD/EUR/GBP only
const CURRENCIES = {
  USD: { code: 0, symbol: '$', name: 'US Dollar', decimals: 4, locale: 'en-US' },
  EUR: { code: 1, symbol: '€', name: 'Euro', decimals: 4, locale: 'en-IE' },
  GBP: { code: 2, symbol: '£', name: 'British Pound', decimals: 4, locale: 'en-GB' }
};

// Web3Modal provider options
const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      projectId: "084d65a488f56065ea7a901e023a8b3e",
      infuraId: "9aa3d95b3bc440fa88ea12eaa4456161",
      rpc: {
        11155111: "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
      },
      chainId: 11155111,
      bridge: "https://bridge.walletconnect.org",
      qrcode: true,
      qrcodeModalOptions: {
        mobileLinks: ["metamask", "trust", "rainbow", "argent", "imtoken", "pillar", "coinbase"]
      }
    }
  },
  injected: {
    display: {
      name: "Injected",
      description: "Connect with the provider in your browser"
    },
    package: null
  }
};

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);
  const [savingsContract, setSavingsContract] = useState(null);
  const [validatorFundContract, setValidatorFundContract] = useState(null);
  const [donorRegistryContract, setDonorRegistryContract] = useState(null);
  const [stabilityContract, setStabilityContract] = useState(null);
  const [routerContract, setRouterContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [ethBalance, setEthBalance] = useState('0');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('time');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [web3auth, setWeb3auth] = useState(null);
  const [loginMethod, setLoginMethod] = useState(null); // 'wallet' | 'social' | null
  const [ethPrice, setEthPrice] = useState(null);
  const [showFiat, setShowFiat] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    return localStorage.getItem('oooweee_currency') || 'EUR';
  });
  const [web3Modal, setWeb3Modal] = useState(null);
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [initialDepositInput, setInitialDepositInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ethToBuy, setEthToBuy] = useState('0.01');
  const [estimatedOooweee, setEstimatedOooweee] = useState('0');
  const [accountCurrency, setAccountCurrency] = useState(() => {
    return localStorage.getItem('oooweee_currency') || 'EUR';
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [requiredOooweeeForPurchase, setRequiredOooweeeForPurchase] = useState(null);
  
  // Donate modal state
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState('0.05');
  const [donorMessage, setDonorMessage] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorLocation, setDonorLocation] = useState('');
  const [donorShoutout, setDonorShoutout] = useState(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('oooweee_donor_shoutout');
    return saved ? JSON.parse(saved) : null;
  });
  const [donorLeaderboard, setDonorLeaderboard] = useState(() => {
    // Load leaderboard from localStorage on init
    const saved = localStorage.getItem('oooweee_donor_leaderboard');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Validator stats
  const [validatorStats, setValidatorStats] = useState({
    validators: 0,
    nextValidatorIn: '32',
    progress: 0,
    pendingETH: '0',
    totalDonations: '0',
    donors: 0,
    fromStability: '0',
    fromRewards: '0',
    topDonor: null,
    topDonorAmount: '0'
  });
  
  // Price tracking
  const [oooweeePrice, setOooweeePrice] = useState(0.00001);
  const [priceFlash, setPriceFlash] = useState(null); // 'up' | 'down' | null
  const prevOooweeePriceRef = useRef(0.00001);
  
  // Admin Dashboard State
  const [adminStats, setAdminStats] = useState({
    totalValueLocked: '0',
    totalAccountsCreated: 0,
    totalGoalsCompleted: 0,
    totalFeesCollected: '0',
    totalRewardsDistributed: '0',
    totalActiveBalance: '0',
    currentPrice: '0',
    baselinePrice: '0',
    tokenBalance: '0',
    interventionsToday: 0,
    totalInterventions: 0,
    tokensUsedToday: '0',
    totalTokensUsed: '0',
    totalETHCaptured: '0',
    totalETHSentToValidators: '0',
    circuitBreakerTripped: false,
    systemChecksEnabled: true,
    marketHighVolatility: false,
    blockNumber: 0,
    lastBlockTime: 0,
    isSequencerHealthy: true,
    isPriceOracleHealthy: true,
    priceIncreasePercent: 0
  });
  
  // Load admin statistics
  const loadAdminStats = useCallback(async () => {
    if (!stabilityContract || !savingsContract || !provider) return;
    
    try {
      const [stabilityInfo, marketConditions, circuitBreaker, statsView, blockNumber, checksEnabled] = await Promise.all([
        stabilityContract.getStabilityInfo(),
        stabilityContract.getMarketConditions(),
        stabilityContract.getCircuitBreakerStatus(),
        savingsContract.getStatsView(),
        provider.getBlockNumber(),
        stabilityContract.systemChecksEnabled()
      ]);
      
      const block = await provider.getBlock(blockNumber);
      
      setAdminStats({
        totalValueLocked: ethers.utils.formatUnits(statsView[0], 18),
        totalAccountsCreated: statsView[1].toNumber(),
        totalGoalsCompleted: statsView[2].toNumber(),
        totalActiveBalance: ethers.utils.formatUnits(statsView[3], 18),
        totalRewardsDistributed: ethers.utils.formatUnits(statsView[4], 18),
        totalFeesCollected: ethers.utils.formatUnits(statsView[5], 18),
        currentPrice: ethers.utils.formatUnits(stabilityInfo[0], 18),
        baselinePrice: ethers.utils.formatUnits(stabilityInfo[6], 18),
        tokenBalance: ethers.utils.formatUnits(stabilityInfo[1], 18),
        totalInterventions: stabilityInfo[2].toNumber(),
        totalTokensUsed: ethers.utils.formatUnits(stabilityInfo[3], 18),
        totalETHCaptured: ethers.utils.formatUnits(stabilityInfo[4], 18),
        totalETHSentToValidators: ethers.utils.formatUnits(stabilityInfo[5], 18),
        priceIncreasePercent: stabilityInfo[7].toNumber(),
        circuitBreakerTripped: circuitBreaker[0],
        interventionsToday: circuitBreaker[1].toNumber(),
        tokensUsedToday: ethers.utils.formatUnits(circuitBreaker[2], 18),
        marketHighVolatility: marketConditions[0],
        currentCheckInterval: marketConditions[1].toNumber(),
        blocksSinceLastSpike: marketConditions[2].toNumber(),
        dailyInterventionCount: marketConditions[3].toNumber(),
        blockNumber: blockNumber,
        lastBlockTime: block.timestamp,
        isSequencerHealthy: true,
        isPriceOracleHealthy: stabilityInfo[0].gt(0),
        systemChecksEnabled: checksEnabled
      });
    } catch (error) {
      console.error('Error loading admin stats:', error);
    }
  }, [stabilityContract, savingsContract, provider]);

  // Admin refresh interval
  useEffect(() => {
    if (account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && activeTab === 'admin') {
      loadAdminStats();
      const interval = setInterval(loadAdminStats, 5000);
      return () => clearInterval(interval);
    }
  }, [account, activeTab, loadAdminStats]);

  // Stability event alerting — listen for circuit breaker and interventions
  useEffect(() => {
    if (!stabilityContract || !account) return;
    const isAdmin = account.toLowerCase() === ADMIN_WALLET.toLowerCase();

    const onCircuitBreakerTripped = (reason) => {
      toast.error(`Circuit breaker tripped: ${reason}`, { duration: 10000 });
      if (isAdmin) loadAdminStats();
    };

    const onIntervention = (tokensInjected, ethCaptured) => {
      if (isAdmin) {
        const tokens = parseFloat(ethers.utils.formatUnits(tokensInjected, 18)).toLocaleString();
        const eth = parseFloat(ethers.utils.formatEther(ethCaptured)).toFixed(4);
        toast(`Stability intervention: ${tokens} tokens sold for ${eth} ETH`, { duration: 8000 });
        loadAdminStats();
      }
    };

    const onCircuitBreakerReset = () => {
      if (isAdmin) {
        toast.success('Circuit breaker reset', { duration: 5000 });
        loadAdminStats();
      }
    };

    stabilityContract.on('CircuitBreakerTripped', onCircuitBreakerTripped);
    stabilityContract.on('StabilityIntervention', onIntervention);
    stabilityContract.on('CircuitBreakerReset', onCircuitBreakerReset);

    return () => {
      stabilityContract.off('CircuitBreakerTripped', onCircuitBreakerTripped);
      stabilityContract.off('StabilityIntervention', onIntervention);
      stabilityContract.off('CircuitBreakerReset', onCircuitBreakerReset);
    };
  }, [stabilityContract, account, loadAdminStats]);

  // Admin functions
  const resetCircuitBreaker = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.resetCircuitBreaker();
      await toast.promise(tx.wait(), {
        loading: '🔧 Resetting circuit breaker...',
        success: '✅ Circuit breaker reset!',
        error: '❌ Failed to reset'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to reset circuit breaker');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleSystemChecks = async () => {
    try {
      setLoading(true);
      const newState = !adminStats.systemChecksEnabled;
      const tx = await stabilityContract.setChecksEnabled(newState);
      await toast.promise(tx.wait(), {
        loading: newState ? '▶️ Resuming checks...' : '⏸️ Pausing checks...',
        success: newState ? '✅ Checks resumed!' : '✅ Checks paused!',
        error: '❌ Failed to toggle'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to toggle system checks');
    } finally {
      setLoading(false);
    }
  };
  
  const manualStabilityCheck = async () => {
    try {
      setLoading(true);
      const tx = await stabilityContract.manualStabilityCheck({
        value: ethers.utils.parseEther("0.01")
      });
      await toast.promise(tx.wait(), {
        loading: '🔍 Running stability check...',
        success: '✅ Stability check complete!',
        error: '❌ Check failed'
      });
      await loadAdminStats();
    } catch (error) {
      console.error(error);
      toast.error('Failed to run stability check: ' + (error.reason || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  
  // Initialize on load
  useEffect(() => {
    const init = async () => {
      setIsAppLoading(true);

      const web3ModalInstance = new Web3Modal({
        cacheProvider: true,
        providerOptions
      });

      setWeb3Modal(web3ModalInstance);

      // Initialize Web3Auth
      try {
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: { chainConfig: SEPOLIA_CHAIN_CONFIG },
        });

        const web3authInstance = new Web3Auth({
          clientId: WEB3AUTH_CLIENT_ID,
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
          privateKeyProvider,
          uiConfig: {
            appName: "OOOWEEE Protocol",
            mode: "dark",
            loginMethodsOrder: ["google", "email_passwordless"],
            defaultLanguage: "en",
            theme: { primary: "#7B68EE" },
          },
        });

        await web3authInstance.initModal();
        setWeb3auth(web3authInstance);

        // Auto-reconnect if Web3Auth has an active session
        if (web3authInstance.connected && web3authInstance.provider) {
          const web3Provider = new ethers.providers.Web3Provider(web3authInstance.provider);
          const signer = web3Provider.getSigner();
          const address = await signer.getAddress();

          const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
          const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
          const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
          const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
          const donorRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DonorRegistry, DonorRegistryABI, signer);
          const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);

          setAccount(address);
          setProvider(web3Provider);
          setTokenContract(token);
          setSavingsContract(savings);
          setValidatorFundContract(validatorFund);
          setDonorRegistryContract(donorRegistry);
          setStabilityContract(stability);
          setRouterContract(router);
          setLoginMethod('social');
        }
      } catch (error) {
        console.error('Web3Auth init error:', error);
        // Non-fatal — wallet login still works
      }

      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp');
        const data = await response.json();
        setEthPrice(data.ethereum);
      } catch (error) {
        console.error('Error fetching ETH price:', error);
        setEthPrice({ usd: 2000, eur: 1850, gbp: 1600 });
      }
      
      setTimeout(() => setIsAppLoading(false), 1500);
    };
    
    init();
  }, []);

  // Auto-reconnect wallet if cached - FIX: Prevent multiple connections
  useEffect(() => {
    if (web3Modal && web3Modal.cachedProvider && !account && !isConnecting) {
      connectWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [web3Modal]);

  // Persist selected currency
  useEffect(() => {
    localStorage.setItem('oooweee_currency', selectedCurrency);
  }, [selectedCurrency]);

  // Refresh ETH/fiat prices every 60s (CoinGecko free tier safe)
  useEffect(() => {
    const refreshEthPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp'
        );
        const data = await response.json();
        if (data.ethereum) {
          setEthPrice(data.ethereum);
        }
      } catch (error) {
        console.error('ETH price refresh failed:', error);
      }
    };

    const interval = setInterval(refreshEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Price flash animation on OOOWEEE price change
  useEffect(() => {
    if (prevOooweeePriceRef.current !== oooweeePrice && oooweeePrice > 0 && prevOooweeePriceRef.current > 0) {
      setPriceFlash(oooweeePrice > prevOooweeePriceRef.current ? 'up' : 'down');
      prevOooweeePriceRef.current = oooweeePrice;
      const timeout = setTimeout(() => setPriceFlash(null), 1500);
      return () => clearTimeout(timeout);
    }
    prevOooweeePriceRef.current = oooweeePrice;
  }, [oooweeePrice]);

  // Format currency
  const formatCurrency = (amount, currency = 'eur') => {
    const curr = Object.entries(CURRENCIES).find(([key, _]) => key.toLowerCase() === currency.toLowerCase()) || ['EUR', CURRENCIES.EUR];
    return new Intl.NumberFormat(curr[1].locale, {
      style: 'currency',
      currency: curr[0],
      minimumFractionDigits: curr[1].decimals,
      maximumFractionDigits: curr[1].decimals
    }).format(amount);
  };

  // Update OOOWEEE price
  const updateOooweeePrice = useCallback(async () => {
    if (!routerContract) return;
    
    try {
      const ethAmount = ethers.utils.parseEther("1");
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const oooweeePerEth = parseFloat(ethers.utils.formatUnits(amounts[1], 18));
      setOooweeePrice(1 / oooweeePerEth);
    } catch (error) {
      console.error('Error fetching OOOWEEE price:', error);
    }
  }, [routerContract]);

  // Update price periodically
  useEffect(() => {
    if (routerContract) {
      updateOooweeePrice();
      const interval = setInterval(updateOooweeePrice, 30000);
      return () => clearInterval(interval);
    }
  }, [routerContract, updateOooweeePrice]);

  // Estimate OOOWEEE output (debounced)
  useEffect(() => {
    const estimateOooweee = async () => {
      if (!routerContract || !ethToBuy || parseFloat(ethToBuy) <= 0) {
        setEstimatedOooweee('0');
        return;
      }
      
      try {
        const ethAmount = ethers.utils.parseEther(ethToBuy);
        const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
        const amounts = await routerContract.getAmountsOut(ethAmount, path);
        setEstimatedOooweee(ethers.utils.formatUnits(amounts[1], 18));
      } catch (error) {
        setEstimatedOooweee('0');
      }
    };
    
    // Debounce: wait 500ms after user stops typing
    const timeoutId = setTimeout(estimateOooweee, 500);
    return () => clearTimeout(timeoutId);
  }, [ethToBuy, routerContract]);

  // Load validator stats - with error handling
  const loadValidatorStats = useCallback(async () => {
    if (!validatorFundContract) return;
    
    try {
      const [stats, ethNeeded, progressData] = await Promise.all([
        validatorFundContract.getStats(),
        validatorFundContract.ethUntilNextValidator(),
        validatorFundContract.progressToNextValidator()
      ]);

      // getStats() returns 10 values:
      // [0] totalETHReceived, [1] fromStability, [2] fromDonations,
      // [3] fromRewards, [4] pendingRewards, [5] availableForValidators,
      // [6] validatorsProvisioned, [7] validatorsActive,
      // [8] totalDistributions, [9] donorCount

      // Build on-chain leaderboard by iterating the donors array
      let topDonor = null;
      let topDonorAmount = ethers.BigNumber.from(0);
      const donorCount = stats[9].toNumber();
      const onChainDonors = [];

      if (donorCount > 0 && donorCount <= 100) {
        for (let i = 0; i < donorCount; i++) {
          try {
            const donorAddr = await validatorFundContract.donors(i);
            const donorAmt = await validatorFundContract.donations(donorAddr);
            onChainDonors.push({ address: donorAddr, amount: donorAmt });
            if (donorAmt.gt(topDonorAmount)) {
              topDonor = donorAddr;
              topDonorAmount = donorAmt;
            }
          } catch (e) {
            break;
          }
        }
      }

      // Build leaderboard — merge on-chain amounts with DonorRegistry names
      // Create a read-only DonorRegistry instance for fetching metadata
      const registryRead = new ethers.Contract(
        CONTRACT_ADDRESSES.DonorRegistry,
        DonorRegistryABI,
        validatorFundContract.provider
      );

      const sortedDonors = onChainDonors
        .sort((a, b) => (b.amount.gt(a.amount) ? 1 : b.amount.lt(a.amount) ? -1 : 0))
        .slice(0, 10);

      const leaderboard = await Promise.all(
        sortedDonors.map(async (d) => {
          let name = null, message = null, location = null;
          try {
            const info = await registryRead.getDonorInfo(d.address);
            if (info.timestamp && info.timestamp.toNumber() > 0) {
              name = info.name || null;
              message = info.message || null;
              location = info.location || null;
            }
          } catch (e) {
            // DonorRegistry might not have this donor
          }
          return {
            address: d.address,
            shortAddress: `${d.address.slice(0, 6)}...${d.address.slice(-4)}`,
            name,
            message,
            location,
            amount: parseFloat(ethers.utils.formatEther(d.amount)).toFixed(4)
          };
        })
      );
      setDonorLeaderboard(leaderboard);

      setValidatorStats({
        validators: stats[7].toString(),
        nextValidatorIn: ethers.utils.formatEther(ethNeeded),
        progress: (parseFloat(ethers.utils.formatEther(progressData[0])) / 32) * 100,
        pendingETH: ethers.utils.formatEther(progressData[0]),
        totalDonations: ethers.utils.formatEther(stats[2]),
        donors: stats[9].toString(),
        fromStability: ethers.utils.formatEther(stats[1]),
        fromRewards: ethers.utils.formatEther(stats[3]),
        topDonor: topDonor,
        topDonorAmount: ethers.utils.formatEther(topDonorAmount)
      });
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  }, [validatorFundContract]);

  // Load validator stats
  useEffect(() => {
    if (validatorFundContract) {
      loadValidatorStats();
      const interval = setInterval(loadValidatorStats, 10000);
      return () => clearInterval(interval);
    }
  }, [validatorFundContract, loadValidatorStats]);

  // Calculate fiat value
  const getOooweeeInFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice) return '...';
    const ethValue = parseFloat(oooweeeAmount) * oooweeePrice;
    const fiatValue = ethValue * (ethPrice[currency.toLowerCase()] || ethPrice.eur);
    return formatCurrency(fiatValue, currency);
  };

  // Convert fiat to OOOWEEE amount
  const convertFiatToOooweee = (fiatAmount, currency = 'eur') => {
    if (!ethPrice || !fiatAmount) return 0;
    const ethValue = parseFloat(fiatAmount) / (ethPrice[currency.toLowerCase()] || ethPrice.eur);
    const oooweeeAmount = ethValue / oooweeePrice;
    return Math.floor(oooweeeAmount);
  };

  // Convert OOOWEEE to fiat
  const convertOooweeeToFiat = (oooweeeAmount, currency = 'eur') => {
    if (!ethPrice || !oooweeeAmount) return 0;
    const ethValue = parseFloat(oooweeeAmount) * oooweeePrice;
    return ethValue * (ethPrice[currency.toLowerCase()] || ethPrice.eur);
  };

  // Open buy modal with a specific amount pre-filled
  const openBuyModalWithAmount = async (neededOooweee) => {
    setRequiredOooweeeForPurchase(neededOooweee);
    // Calculate ETH needed for display
    try {
      const tokensNeeded = ethers.utils.parseUnits(Math.ceil(neededOooweee).toString(), 18);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const amountsIn = await routerContract.getAmountsIn(tokensNeeded, path);
      // Add 5% buffer
      const ethNeeded = amountsIn[0].mul(105).div(100);
      setEthToBuy(ethers.utils.formatEther(ethNeeded));
    } catch (error) {
      console.error('Error calculating ETH needed:', error);
    }
    setShowBuyModal(true);
  };

  // Buy OOOWEEE with ETH
  const buyOooweee = async () => {
    if (!ethToBuy || parseFloat(ethToBuy) <= 0) {
      toast.error('Enter a valid ETH amount');
      return;
    }
    
    try {
      setLoading(true);
      
      const ethAmount = ethers.utils.parseEther(ethToBuy);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const minOutput = amounts[1].mul(97).div(100);
      
      const tx = await routerContract.swapExactETHForTokens(
        minOutput,
        path,
        account,
        deadline,
        { value: ethAmount }
      );
      
      await toast.promise(tx.wait(), {
        loading: '🔄 Swapping ETH for OOOWEEE...',
        success: `🎉 Bought ${parseFloat(estimatedOooweee).toFixed(2)} OOOWEEE!`,
        error: '❌ Swap failed'
      });
      
      setShowBuyModal(false);
      setRequiredOooweeeForPurchase(null);
      await loadBalances(account, provider, tokenContract);
      
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.message.includes('insufficient')) {
        toast.error('Insufficient ETH balance');
      } else {
        toast.error('Swap failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Buy EXACT amount of OOOWEEE (for when user needs specific amount)
  const buyExactOooweee = async () => {
    if (!requiredOooweeeForPurchase || requiredOooweeeForPurchase <= 0) {
      toast.error('Invalid amount');
      return;
    }
    
    try {
      setLoading(true);
      
      const tokensNeeded = ethers.utils.parseUnits(Math.ceil(requiredOooweeeForPurchase).toString(), 18);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // Get ETH needed for exact token amount
      const amountsIn = await routerContract.getAmountsIn(tokensNeeded, path);
      // Add 5% buffer for price movement
      const ethWithBuffer = amountsIn[0].mul(105).div(100);
      
      // Use swapETHForExactTokens to get EXACTLY the tokens we need
      const tx = await routerContract.swapETHForExactTokens(
        tokensNeeded,
        path,
        account,
        deadline,
        { value: ethWithBuffer }
      );
      
      await toast.promise(tx.wait(), {
        loading: `🔄 Buying exactly ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE...`,
        success: `🎉 Bought ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE!`,
        error: '❌ Swap failed'
      });
      
      setShowBuyModal(false);
      setRequiredOooweeeForPurchase(null);
      await loadBalances(account, provider, tokenContract);
      
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.message.includes('insufficient')) {
        toast.error('Insufficient ETH balance');
      } else {
        toast.error('Swap failed: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // Connect wallet - FIX: Prevent duplicate connections
  const connectWallet = async () => {
    if (isConnecting) return;
    
    try {
      setIsConnecting(true);
      setLoading(true);
      
      if (!web3Modal) {
        toast.error('Web3Modal not initialized');
        return;
      }
      
      const instance = await web3Modal.connect();
      const web3Provider = new ethers.providers.Web3Provider(instance);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();
      
      const network = await web3Provider.getNetwork();
      if (network.chainId !== 11155111) {
        toast.error('Please switch to Sepolia network');
        setLoading(false);
        setIsConnecting(false);
        return;
      }
      
      // Initialize contracts
      const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
      const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
      const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
      const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
      const donorRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DonorRegistry, DonorRegistryABI, signer);
      const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);

      setAccount(address);
      setProvider(web3Provider);
      setTokenContract(token);
      setSavingsContract(savings);
      setValidatorFundContract(validatorFund);
      setDonorRegistryContract(donorRegistry);
      setStabilityContract(stability);
      setRouterContract(router);
      
      // Load user data (read-only operations)
      await loadBalances(address, web3Provider, token);
      await loadSavingsAccounts(address, savings, web3Provider, router, ethPrice);
      
      // Subscribe to events
      if (instance.on) {
        instance.on("accountsChanged", handleAccountsChanged);
        instance.on("chainChanged", handleChainChanged);
      }
      
      setLoginMethod('wallet');
      toast.success('Wallet connected!');
    } catch (error) {
      console.error(error);
      if (error.message !== 'User closed modal') {
        toast.error('Failed to connect wallet');
      }
    } finally {
      setLoading(false);
      setIsConnecting(false);
    }
  };

  // Social login via Web3Auth (Google / Email)
  const connectSocialLogin = async () => {
    if (isConnecting || !web3auth) return;

    try {
      setIsConnecting(true);
      setLoading(true);

      const web3authProvider = await web3auth.connect();

      if (!web3authProvider) {
        throw new Error('No provider returned from Web3Auth');
      }

      const web3Provider = new ethers.providers.Web3Provider(web3authProvider);
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();

      // Initialize contracts (same as wallet flow)
      const token = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEToken, OOOWEEETokenABI, signer);
      const savings = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEESavings, OOOWEEESavingsABI, signer);
      const validatorFund = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEValidatorFund, OOOWEEEValidatorFundABI, signer);
      const stability = new ethers.Contract(CONTRACT_ADDRESSES.OOOWEEEStability, OOOWEEEStabilityABI, signer);
      const donorRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DonorRegistry, DonorRegistryABI, signer);
      const router = new ethers.Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);

      setAccount(address);
      setProvider(web3Provider);
      setTokenContract(token);
      setSavingsContract(savings);
      setValidatorFundContract(validatorFund);
      setDonorRegistryContract(donorRegistry);
      setStabilityContract(stability);
      setRouterContract(router);
      setLoginMethod('social');

      await loadBalances(address, web3Provider, token);
      await loadSavingsAccounts(address, savings, web3Provider, router, ethPrice);

      toast.success('Signed in successfully!');
    } catch (error) {
      console.error('Social login error:', error);
      if (error.message !== 'User closed popup' && error.message !== 'user closed popup') {
        toast.error('Failed to sign in');
      }
    } finally {
      setLoading(false);
      setIsConnecting(false);
    }
  };

  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      window.location.reload();
    }
  };

  const handleChainChanged = (chainId) => {
    window.location.reload();
  };

  const donateToValidators = async () => {
    setShowDonateModal(true);
  };

  // Fiat onramp — buy ETH with card / Google Pay / Apple Pay
  const openFiatOnramp = () => {
    if (!account) {
      toast.error('Please connect your wallet first');
      return;
    }

    const transakUrl = new URL('https://global-stg.transak.com');
    transakUrl.searchParams.set('apiKey', TRANSAK_API_KEY);
    transakUrl.searchParams.set('environment', 'STAGING');
    transakUrl.searchParams.set('cryptoCurrencyCode', 'ETH');
    transakUrl.searchParams.set('network', 'ethereum');
    transakUrl.searchParams.set('defaultCryptoCurrency', 'ETH');
    transakUrl.searchParams.set('walletAddress', account);
    transakUrl.searchParams.set('fiatCurrency', selectedCurrency);
    transakUrl.searchParams.set('defaultFiatAmount', '50');
    transakUrl.searchParams.set('themeColor', '7B68EE');
    transakUrl.searchParams.set('disableWalletAddressForm', 'true');

    // Open in a popup window
    const width = 450;
    const height = 700;
    const left = (window.innerWidth - width) / 2 + window.screenX;
    const top = (window.innerHeight - height) / 2 + window.screenY;
    window.open(
      transakUrl.toString(),
      'transak_widget',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    toast('ETH purchase window opened! Your balance will update after the purchase completes.', { icon: '💳', duration: 5000 });

    // Poll for balance changes after opening widget
    const startBalance = ethBalance;
    const pollInterval = setInterval(async () => {
      if (provider && tokenContract && account) {
        await loadBalances(account, provider, tokenContract);
      }
    }, 15000);

    // Stop polling after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 600000);
  };

  const handleDonateSubmit = async () => {
    if (!donateAmount || parseFloat(donateAmount) <= 0) {
      toast.error('Enter a valid ETH amount');
      return;
    }
    
    try {
      setLoading(true);
      const amount = parseFloat(donateAmount);
      const isSponsor = amount >= 0.05;
      const hasMetadata = isSponsor && (donorName.trim() || donorMessage.trim() || donorLocation.trim());
      let donationWei = ethers.utils.parseEther(donateAmount);
      let registrationCostWei = ethers.BigNumber.from(0);

      // Sponsor tier (0.05+ ETH): estimate registration gas cost
      // and subtract it from the donation so total spend = donateAmount
      if (donorRegistryContract && hasMetadata) {
        try {
          const gasEstimate = await donorRegistryContract.estimateGas.registerDonation(
            donorName.trim().slice(0, 50) || 'Anonymous',
            donorMessage.trim().slice(0, 180),
            donorLocation.trim().slice(0, 50)
          );
          const gasPrice = await provider.getGasPrice();
          registrationCostWei = gasEstimate.mul(gasPrice).mul(120).div(100); // 20% buffer
          donationWei = donationWei.sub(registrationCostWei);
          if (donationWei.lte(0)) {
            toast.error('Donation amount too small to cover registration gas');
            setLoading(false);
            return;
          }
        } catch (e) {
          // Can't estimate — just send full amount as donation, skip registration
          console.warn('Could not estimate registration gas:', e);
          registrationCostWei = ethers.BigNumber.from(0);
          donationWei = ethers.utils.parseEther(donateAmount);
        }
      }

      const actualDonation = ethers.utils.formatEther(donationWei);
      const tx = await validatorFundContract.donate({ value: donationWei });

      await toast.promise(tx.wait(), {
        loading: '💰 Sending donation...',
        success: `🎉 Donated ${parseFloat(actualDonation).toFixed(4)} ETH to validator fund!`,
        error: '❌ Donation failed'
      });

      // Register donor metadata on-chain (gas already budgeted from donation amount)
      if (donorRegistryContract && hasMetadata) {
        try {
          const regTx = await donorRegistryContract.registerDonation(
            donorName.trim().slice(0, 50) || 'Anonymous',
            donorMessage.trim().slice(0, 180),
            donorLocation.trim().slice(0, 50)
          );
          await toast.promise(regTx.wait(), {
            loading: '📝 Saving your name on-chain...',
            success: '✅ Name & message saved!',
            error: '⚠️ Name save failed'
          });
        } catch (regError) {
          console.error('Donor registration failed:', regError);
          if (regError.code !== 'ACTION_REJECTED') {
            toast('Donation sent! Name save failed — try again next time', { icon: '⚠️' });
          }
        }
      }

      // Save shoutout locally for immediate display
      if (donorMessage.trim()) {
        const newShoutout = {
          message: donorMessage.trim().slice(0, 180),
          amount: donateAmount,
          name: donorName.trim().slice(0, 50) || null,
          location: donorLocation.trim().slice(0, 50) || null,
          sender: `${account.slice(0, 6)}...${account.slice(-4)}`,
          timestamp: Date.now()
        };
        setDonorShoutout(newShoutout);
        localStorage.setItem('oooweee_donor_shoutout', JSON.stringify(newShoutout));
      }
      
      await loadValidatorStats();
      setShowDonateModal(false);
      setDonateAmount('0.05');
      setDonorMessage('');
      setDonorName('');
      setDonorLocation('');
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Donation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = async () => {
    // Logout from Web3Auth if social login
    if (loginMethod === 'social' && web3auth) {
      try {
        await web3auth.logout();
      } catch (e) {
        console.error('Web3Auth logout error:', e);
      }
    }

    if (web3Modal) {
      web3Modal.clearCachedProvider();
    }

    if (window.ethereum) {
      window.ethereum.removeAllListeners('accountsChanged');
      window.ethereum.removeAllListeners('chainChanged');
    }

    setAccount(null);
    setProvider(null);
    setTokenContract(null);
    setSavingsContract(null);
    setValidatorFundContract(null);
    setDonorRegistryContract(null);
    setStabilityContract(null);
    setRouterContract(null);
    setBalance('0');
    setEthBalance('0');
    setAccounts([]);
    setLoginMethod(null);
  };

  const loadBalances = async (account, provider, tokenContract) => {
    try {
      const [tokenBal, ethBal] = await Promise.all([
        tokenContract.balanceOf(account),
        provider.getBalance(account)
      ]);
      
      setBalance(ethers.utils.formatUnits(tokenBal, 18));
      setEthBalance(ethers.utils.formatEther(ethBal));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  // Helper function to get currency code from enum value
  // Explicit array to avoid relying on Object.keys() order
  const CURRENCY_CODES = ['USD', 'EUR', 'GBP'];
  const getCurrencyFromCode = (code) => {
    return CURRENCY_CODES[code] || 'EUR';
  };

  // FIX: Calculate progress using contract's fiat value (not frontend recalculation)
  const calculateProgress = (acc, currentOooweeePrice, currentEthPrice) => {
    if (acc.type === 'Time') {
      // Time accounts: progress based on time
      const now = Math.floor(Date.now() / 1000);
      const created = acc.createdAt || now;
      const unlock = acc.unlockTime;
      if (unlock <= now) return 100;
      const total = unlock - created;
      const elapsed = now - created;
      return Math.min(100, Math.floor((elapsed / total) * 100));
    }
    
    if (acc.isFiatTarget && acc.targetFiat > 0) {
      // Use contract's currentFiatValue if available (matches displayed value)
      if (acc.currentFiatValue && acc.currentFiatValue > 0) {
        // Both values are in smallest units (4 decimals)
        const progress = (acc.currentFiatValue / acc.targetFiat) * 100;
        return Math.min(100, Math.floor(progress));
      }
      
      // Fallback to frontend calculation if contract value not available
      const currencyCode = getCurrencyFromCode(acc.targetCurrency);
      const currencyInfo = CURRENCIES[currencyCode.toUpperCase()] || CURRENCIES.EUR;
      const ethPriceForCurrency = currentEthPrice?.[currencyCode.toLowerCase()] || currentEthPrice?.eur || 1850;
      const tokenValueInEth = parseFloat(acc.balance) * currentOooweeePrice;
      const currentFiatValue = tokenValueInEth * ethPriceForCurrency;
      
      // targetFiat is in smallest units (4 decimals: 10000 = $1.00)
      const targetFiatValue = acc.targetFiat / Math.pow(10, currencyInfo.decimals);
      
      if (targetFiatValue <= 0) return 0;
      return Math.min(100, Math.floor((currentFiatValue / targetFiatValue) * 100));
    }
    
    if (parseFloat(acc.target) > 0) {
      return Math.min(100, Math.floor((parseFloat(acc.balance) / parseFloat(acc.target)) * 100));
    }
    
    return 0;
  };

  // FIX: loadSavingsAccounts now fetches fresh price from router to avoid stale closure bug
  const loadSavingsAccounts = async (userAccount, savingsContractInstance, providerInstance, routerContractInstance, currentEthPrice) => {
    try {
      // CRITICAL FIX: Fetch fresh OOOWEEE price directly from router
      // This prevents stale closure issues where the state value is outdated
      let freshOooweeePrice = 0.00001; // Default fallback
      
      if (routerContractInstance) {
        try {
          const ethAmount = ethers.utils.parseEther("1");
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.OOOWEEEToken];
          const amounts = await routerContractInstance.getAmountsOut(ethAmount, path);
          const oooweeePerEth = parseFloat(ethers.utils.formatUnits(amounts[1], 18));
          freshOooweeePrice = 1 / oooweeePerEth;
          
          // Also update the state so UI stays in sync
          setOooweeePrice(freshOooweeePrice);
        } catch (priceError) {
          console.error('Error fetching fresh OOOWEEE price:', priceError);
        }
      }
      
      // Use current ethPrice or fetch fresh if not provided
      let freshEthPrice = currentEthPrice;
      if (!freshEthPrice) {
        try {
          const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp,jpy,cny,cad,aud,chf,inr,krw');
          const data = await response.json();
          freshEthPrice = data.ethereum;
          setEthPrice(freshEthPrice);
        } catch (e) {
          freshEthPrice = { usd: 2000, eur: 1850, gbp: 1600 };
        }
      }
      
      // Use getUserAccountCount to get TOTAL accounts (not just active ones)
      const [totalCount] = await savingsContractInstance.getUserAccountCount(userAccount);
      const accountDetails = [];
      
      // Loop through ALL account IDs from 0 to total-1
      for (let id = 0; id < totalCount.toNumber(); id++) {
        try {
          const info = await savingsContractInstance.getAccountDetails(userAccount, id);
          
          const ACCOUNT_TYPES = ['Time', 'Balance', 'Growth'];

          const accData = {
            id: id.toString(),
            type: ACCOUNT_TYPES[info[0]],
            isActive: info[1],
            balance: ethers.utils.formatUnits(info[2], 18),
            target: ethers.utils.formatUnits(info[3], 18),
            targetFiat: info[4].toNumber(),
            targetCurrency: info[5],
            unlockTime: info[6].toNumber(),
            recipient: info[7],
            goalName: info[8],
            pendingRewards: '0',
            isFiatTarget: info[4].gt(0)
          };
          
         // Calculate current fiat value using CONTRACT's oracle (ensures match)
          if (accData.isFiatTarget) {
            try {
              const balanceWei = ethers.utils.parseUnits(accData.balance, 18);
              const contractFiatValue = await savingsContractInstance.getBalanceInFiatView(balanceWei, accData.targetCurrency);
              accData.currentFiatValue = contractFiatValue.toNumber();
            } catch (e) {
              console.error('Error getting contract fiat value:', e);
              // Fallback to frontend calculation with 4 decimals
              const currencyCode = getCurrencyFromCode(accData.targetCurrency);
              const ethPriceForCurrency = freshEthPrice?.[currencyCode.toLowerCase()] || freshEthPrice?.eur || 1850;
              const tokenValueInEth = parseFloat(accData.balance) * freshOooweeePrice;
              accData.currentFiatValue = Math.floor(tokenValueInEth * ethPriceForCurrency * 10000); // 4 decimals
            }
          } else {
            accData.currentFiatValue = 0;
          }

          // Calculate progress AFTER currentFiatValue is set (so it uses contract's value)
          accData.progress = calculateProgress(accData, freshOooweeePrice, freshEthPrice);
          
          accountDetails.push(accData);
        } catch (error) {
          console.error(`Error loading account ${id}:`, error);
        }
      }
      
      setAccounts(accountDetails);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const claimAllRewards = async () => {
    try {
      setLoading(true);
      const tx = await savingsContract.claimAllRewards();
      
      await toast.promise(tx.wait(), {
        loading: '🎁 Claiming all rewards...',
        success: '✅ All rewards claimed!',
        error: '❌ Failed to claim rewards'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      
    } catch (error) {
      console.error(error);
      toast.error('Failed to claim rewards');
    } finally {
      setLoading(false);
    }
  };

  const createTimeAccount = async (unlockDate, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // initialDeposit is already in OOOWEEE (converted from fiat in handleCreateAccount)
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      const depositAmount = ethers.utils.parseUnits(Math.floor(initialDeposit).toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const createTx = await savingsContract.createTimeAccountFiat(
        unlockTime,
        goalName,
        depositAmount,
        CURRENCIES[currency].code
      );
      
      await toast.promise(createTx.wait(), {
        loading: '🐷 Creating piggy bank...',
        success: `🎉 Time account created with ${Math.floor(initialDeposit).toLocaleString()} $OOOWEEE!`,
        error: '❌ Failed to create account'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // FIX: Better validation for Growth account creation
  const createGrowthAccount = async (targetAmount, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // initialDeposit is already in OOOWEEE (converted from fiat in handleCreateAccount)
      // Target validation is done in handleCreateAccount
      
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(Math.floor(initialDeposit).toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const createTx = await savingsContract.createGrowthAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        goalName,
        depositAmount
      );
      
      await toast.promise(createTx.wait(), {
        loading: '🌱 Planting money tree...',
        success: `🎉 Growth account created! Target: ${CURRENCIES[currency].symbol}${targetAmount}`,
        error: '❌ Failed to create account'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else if (error.reason?.includes('Target must be higher')) {
        toast.error('Target must be higher than initial deposit value');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const createBalanceAccount = async (targetAmount, recipientAddress, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // initialDeposit is already in OOOWEEE (converted from fiat in handleCreateAccount)
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        // Open buy modal with exact amount needed
        toast(`You need ${Math.ceil(needed).toLocaleString()} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(Math.floor(initialDeposit).toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const createTx = await savingsContract.createBalanceAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        recipientAddress,
        goalName,
        depositAmount
      );
      
      await toast.promise(createTx.wait(), {
        loading: '⚖️ Setting up balance account...',
        success: `🎉 Balance account created! Will send to ${recipientAddress.slice(0,6)}...`,
        error: '❌ Failed to create account'
      });
      
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account: ' + (error.reason || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    const goalName = document.getElementById('goalName').value;
    const initialDepositFiat = document.getElementById('initialDeposit').value;
    
    if (!goalName) {
      toast.error('Please enter a quest name');
      return;
    }
    
    if (!initialDepositFiat || parseFloat(initialDepositFiat) <= 0) {
      toast.error('Please enter an initial deposit amount');
      return;
    }
    
    // Check minimum deposit in EUR equivalent
    const depositInEur = accountCurrency === 'EUR' 
      ? parseFloat(initialDepositFiat)
      : parseFloat(initialDepositFiat) * (ethPrice?.eur || 1850) / (ethPrice?.[accountCurrency.toLowerCase()] || 1850);
    
    if (depositInEur < 10) {
      toast.error('Minimum deposit is €10 equivalent');
      return;
    }
    
    // Convert fiat deposit to OOOWEEE
    const initialDepositOooweee = convertFiatToOooweee(initialDepositFiat, accountCurrency.toLowerCase());
    
    if (initialDepositOooweee <= 0) {
      toast.error('Deposit amount too small');
      return;
    }
    
    if (accountType === 'time') {
      const unlockDate = document.getElementById('unlockDate').value;
      if (!unlockDate) {
        toast.error('Please select an unlock date');
        return;
      }
      createTimeAccount(unlockDate, goalName, initialDepositOooweee, accountCurrency);
    } else if (accountType === 'growth') {
      const targetAmount = document.getElementById('targetAmount').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      // Validate target > deposit (both in fiat)
      if (parseFloat(initialDepositFiat) >= parseFloat(targetAmount)) {
        toast.error('Target must be higher than initial deposit');
        return;
      }
      createGrowthAccount(targetAmount, goalName, initialDepositOooweee, accountCurrency);
    } else if (accountType === 'balance') {
      const targetAmount = document.getElementById('targetAmount').value;
      const recipientAddress = document.getElementById('recipientAddress').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      if (!recipientAddress) {
        toast.error('Please enter a recipient address');
        return;
      }
      createBalanceAccount(targetAmount, recipientAddress, goalName, initialDepositOooweee, accountCurrency);
    }
  };

  const depositToAccount = async (accountId, amount) => {
    try {
      setLoading(true);
      
      const depositAmountNumber = parseFloat(amount);
      const currentBalance = parseFloat(balance);
      
      if (currentBalance < depositAmountNumber) {
        const needed = depositAmountNumber - currentBalance;
        
        // Open buy modal with exact amount needed
        toast(`You need ${needed.toFixed(0)} more OOOWEEE`, { icon: '💡' });
        await openBuyModalWithAmount(needed);
        setLoading(false);
        return;
      }
      
      const depositAmount = ethers.utils.parseUnits(depositAmountNumber.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.OOOWEEESavings, depositAmount);
      
      await toast.promise(approveTx.wait(), {
        loading: '🔓 Approving tokens...',
        success: '✅ Tokens approved!',
        error: '❌ Failed to approve'
      });
      
      const depositTx = await savingsContract.deposit(accountId, depositAmount);
      
      await toast.promise(depositTx.wait(), {
        loading: `💰 Depositing ${depositAmountNumber} OOOWEEE...`,
        success: `🎉 Deposited ${depositAmountNumber} $OOOWEEE!`,
        error: '❌ Failed to deposit'
      });
      
      // CRITICAL: Pass all required params including routerContract for fresh price fetch
      await loadSavingsAccounts(account, savingsContract, provider, routerContract, ethPrice);
      await loadBalances(account, provider, tokenContract);

    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to deposit: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (unlockTime) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = unlockTime - now;
    return Math.max(0, Math.floor(remaining / 86400));
  };

  const activeAccounts = accounts.filter(acc => acc.isActive);
  const completedAccounts = accounts.filter(acc => !acc.isActive);

  if (isAppLoading) {
    return (
      <div className="loading-screen">
        <img src={oooweeLogo} alt="Loading..." className="loading-logo pixel-art" />
        <div className="loading-bar">
          <div className="loading-progress"></div>
        </div>
        <p className="loading-text">Loading OOOWEEE Protocol...</p>
      </div>
    );
  }

  const renderAboutPage = () => (
    <div className="about-page">
      <div className="about-header">
        <img src={oooweeLogo} alt="OOOWEEE" className="about-logo pixel-art" />
        <h1>The OOOWEEE Protocol</h1>
        <p className="subtitle">Decentralized Savings Revolution</p>
      </div>

      <div className="about-section">
        <h2>The Problem</h2>
        <p>Traditional banks make it too easy to break your savings goals. That "7-day cooling period"? You can still break it. Those withdrawal fees? They're not enough to stop impulsive spending.</p>
      </div>

      <div className="about-section">
        <h2>The Solution</h2>
        <p>OOOWEEE creates truly immutable savings accounts using smart contracts. When you lock your funds, they're REALLY locked - no bank manager can override it, no "forgot password" backdoor. Your future self will thank you.</p>
      </div>

      <div className="value-flow">
        <h2>How It Works</h2>
        <div className="flow-diagram">
          <div className="flow-step">
            <span className="step-icon">📈</span>
            <h3>Speculation</h3>
            <p>Traders buy OOOWEEE, price increases</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span className="step-icon">🛡️</span>
            <h3>Stability</h3>
            <p>System sells into pumps, captures ETH</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span className="step-icon">🔐</span>
            <h3>Validators</h3>
            <p>ETH funds validators, earns 4% APY</p>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <span className="step-icon">🎁</span>
            <h3>Rewards</h3>
            <p>Savers earn passive income</p>
          </div>
        </div>
      </div>

      <div className="tokenomics-section">
        <h2>Tokenomics</h2>
        <div className="tokenomics-grid">
          <div className="token-stat">
            <h4>Total Supply</h4>
            <p>100,000,000 $OOOWEEE</p>
          </div>
          <div className="token-stat">
            <h4>Stability Reserve</h4>
            <p>89,000,000 (89%)</p>
          </div>
          <div className="token-stat">
            <h4>Founder Allocation</h4>
            <p>10,000,000 (10%)</p>
          </div>
          <div className="token-stat">
            <h4>Initial Liquidity</h4>
            <p>1,000,000 (1%)</p>
          </div>
        </div>
      </div>

      <div className="cta-section">
        <h2>Join the Revolution</h2>
        <p>Take control of your financial future. Start saving with OOOWEEE today.</p>
        <button onClick={() => setActiveTab('dashboard')} className="cta-button rainbow-btn">
          Start Saving Now
        </button>
      </div>
    </div>
  );
  
  // NEW Community page render method
  const renderCommunityPage = () => (
    <div className="community-page">
      <div className="community-header">
        <h1>OOOWEEE Community</h1>
        <p>Supporting the network, together!</p>
      </div>

      {/* ATH Donor Banner */}
      {validatorStats.topDonor && parseFloat(validatorStats.topDonorAmount) > 0 && (
        <div className="ath-donor-banner">
          <div className="ath-badge">🏆 TOP SPONSOR</div>
          <div className="ath-content">
            <div className="ath-amount">{parseFloat(validatorStats.topDonorAmount).toFixed(4)} ETH</div>
            {donorLeaderboard.length > 0 && donorLeaderboard[0].name ? (
              <>
                <div className="ath-name">{donorLeaderboard[0].name}</div>
                {donorLeaderboard[0].message && (
                  <div className="ath-message">"{donorLeaderboard[0].message}"</div>
                )}
                {donorLeaderboard[0].location && (
                  <div className="ath-location">📍 {donorLeaderboard[0].location}</div>
                )}
              </>
            ) : (
              <div className="ath-address">{validatorStats.topDonor.slice(0, 6)}...{validatorStats.topDonor.slice(-4)}</div>
            )}
          </div>
        </div>
      )}

      {/* Validator Network Stats */}
      <div className="community-card validator-stats-card">
        <h2>Validator Network</h2>
        <div className="validator-metrics">
          <div className="metric-item">
            <span className="metric-icon">🖥️</span>
            <div className="metric-content">
              <h4>Active Validators</h4>
              <p className="metric-value">{validatorStats.validators}</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">⏳</span>
            <div className="metric-content">
              <h4>Next Validator In</h4>
              <p className="metric-value">{parseFloat(validatorStats.nextValidatorIn).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🛡️</span>
            <div className="metric-content">
              <h4>From Stability</h4>
              <p className="metric-value">{parseFloat(validatorStats.fromStability).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🎁</span>
            <div className="metric-content">
              <h4>From Rewards</h4>
              <p className="metric-value">{parseFloat(validatorStats.fromRewards).toFixed(4)} ETH</p>
            </div>
          </div>
        </div>

        <div className="validator-progress-section">
          <h3>Progress to Next Validator</h3>
          <div className="progress-bar">
            <div
              className="progress-fill validator-progress"
              style={{ width: `${validatorStats.progress}%` }}
            />
          </div>
          <p className="progress-text">{parseFloat(validatorStats.pendingETH).toFixed(4)} / 32 ETH ({validatorStats.progress.toFixed(1)}%)</p>
        </div>
      </div>

      {/* Community Donations */}
      <div className="community-card donations-card">
        <h2>Community Donations</h2>
        <div className="validator-metrics">
          <div className="metric-item">
            <span className="metric-icon">💰</span>
            <div className="metric-content">
              <h4>Total Donated</h4>
              <p className="metric-value">{parseFloat(validatorStats.totalDonations).toFixed(4)} ETH</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">👥</span>
            <div className="metric-content">
              <h4>Total Donors</h4>
              <p className="metric-value">{validatorStats.donors}</p>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-icon">🏆</span>
            <div className="metric-content">
              <h4>Top Donor</h4>
              {validatorStats.topDonor ? (
                <>
                  <p className="metric-value">{parseFloat(validatorStats.topDonorAmount).toFixed(4)} ETH</p>
                  <p className="metric-sub">{validatorStats.topDonor.slice(0, 6)}...{validatorStats.topDonor.slice(-4)}</p>
                </>
              ) : (
                <p className="metric-value">—</p>
              )}
            </div>
          </div>
        </div>

        {account && (
          <button className="donate-btn" onClick={donateToValidators} disabled={loading}>
            💰 Donate to Validators
          </button>
        )}
      </div>

      {/* Donor Leaderboard */}
      {donorLeaderboard.length > 0 && (
        <div className="community-card leaderboard-card">
          <h2>Top Donors</h2>
          <div className="leaderboard-list">
            {donorLeaderboard.map((donor, index) => (
              <div key={donor.address || index} className={`leaderboard-entry ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>
                <span className="medal">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </span>
                <div className="donor-info">
                  <span className="donor-name">{donor.name || donor.shortAddress}</span>
                  {donor.name && <span className="donor-address">{donor.shortAddress}</span>}
                  {donor.message && <span className="donor-message">"{donor.message}"</span>}
                  {donor.location && <span className="donor-location">📍 {donor.location}</span>}
                </div>
                <span className="donor-amount">{donor.amount} ETH</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Community Shoutout */}
      {donorShoutout && (
        <div className="community-card shoutout-card">
          <h2>Community Message</h2>
          <div className="shoutout-content-wrapper">
            <div className="shoutout-icon">💖</div>
            <div className="shoutout-content">
              <blockquote className="shoutout-message">"{donorShoutout.message}"</blockquote>
              <p className="shoutout-meta">
                — {donorShoutout.name || donorShoutout.sender}
                {donorShoutout.location && `, ${donorShoutout.location}`}
                {' '}donated {donorShoutout.amount} ETH
              </p>
            </div>
          </div>
        </div>
      )}

      {/* How to Support */}
      <div className="community-card support-card">
        <h2>How You Can Support</h2>
        <div className="support-methods">
          <div className="support-item">
            <span className="support-icon">💝</span>
            <h3>Donate ETH</h3>
            <p>Help fund validators that generate rewards for all savers</p>
          </div>
          <div className="support-item">
            <span className="support-icon">💰</span>
            <h3>Save with OOOWEEE</h3>
            <p>Create savings accounts to build the ecosystem</p>
          </div>
          <div className="support-item">
            <span className="support-icon">📢</span>
            <h3>Spread the Word</h3>
            <p>Share OOOWEEE with friends and family</p>
          </div>
        </div>
      </div>

      {!account && (
        <div className="community-cta">
          <button onClick={connectWallet} className="connect-btn rainbow-btn" disabled={isConnecting}>
            Connect Wallet to Participate
          </button>
        </div>
      )}
    </div>
  );
  
  // Improved Admin Dashboard
  const renderAdminDashboard = () => (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Protocol Admin Dashboard</h1>
        <p className="admin-address">Connected: {account.slice(0, 6)}...{account.slice(-4)}</p>
      </div>
      
      {/* System Health Overview */}
      <div className="admin-section">
        <h2>System Health</h2>
        <div className="admin-grid-4">
          <div className="admin-card">
            <div className="admin-card-icon">{adminStats.isSequencerHealthy ? '✅' : '🔴'}</div>
            <div className="admin-card-content">
              <h4>L2 Chain</h4>
              <p>Block #{adminStats.blockNumber}</p>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-icon">{adminStats.isPriceOracleHealthy ? '✅' : '🔴'}</div>
            <div className="admin-card-content">
              <h4>Price Oracle</h4>
              <p>${parseFloat(oooweeePrice).toFixed(8)}</p>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-icon">{!adminStats.circuitBreakerTripped ? '✅' : '🔴'}</div>
            <div className="admin-card-content">
              <h4>Circuit Breaker</h4>
              <p>{adminStats.circuitBreakerTripped ? 'TRIPPED' : 'Active'}</p>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card-icon">{adminStats.marketHighVolatility ? '⚠️' : '✅'}</div>
            <div className="admin-card-content">
              <h4>Market Status</h4>
              <p>{adminStats.marketHighVolatility ? 'High Volatility' : 'Normal'}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Protocol Metrics */}
      <div className="admin-section">
        <h2>Protocol Metrics</h2>
        <div className="admin-grid-4">
          <div className="admin-card metric">
            <h4>Total Value Locked</h4>
            <p className="metric-value">{parseFloat(adminStats.totalValueLocked).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
            <span className="metric-usd">≈ {getOooweeeInFiat(adminStats.totalValueLocked, selectedCurrency.toLowerCase())}</span>
          </div>
          <div className="admin-card metric">
            <h4>Total Accounts</h4>
            <p className="metric-value">{adminStats.totalAccountsCreated}</p>
            <span className="metric-label">({adminStats.totalGoalsCompleted} completed)</span>
          </div>
          <div className="admin-card metric">
            <h4>Active Balance</h4>
            <p className="metric-value">{parseFloat(adminStats.totalActiveBalance).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
          </div>
          <div className="admin-card metric">
            <h4>Fees Collected</h4>
            <p className="metric-value">{parseFloat(adminStats.totalFeesCollected).toFixed(2)}</p>
            <span className="metric-label">OOOWEEE</span>
          </div>
        </div>
      </div>
      
      {/* Stability Mechanism */}
      <div className="admin-section">
        <h2>Stability Mechanism (SSA)</h2>
        
        <div className="stability-info-banner">
          <div className="stability-price-info">
            <div className="price-item">
              <label>Current Price</label>
              <span>{parseFloat(adminStats.currentPrice).toFixed(12)} ETH</span>
            </div>
            <div className="price-item">
              <label>Baseline Price</label>
              <span>{parseFloat(adminStats.baselinePrice).toFixed(12)} ETH</span>
            </div>
            <div className="price-item highlight">
              <label>Price Increase</label>
              <span className={adminStats.priceIncreasePercent > 20 ? 'warning' : ''}>
                {adminStats.priceIncreasePercent}%
              </span>
            </div>
          </div>
        </div>
        
        <div className="admin-grid-3">
          <div className="admin-card">
            <h4>Reserve Balance</h4>
            <p className="metric-value">{parseFloat(adminStats.tokenBalance).toLocaleString()}</p>
            <span className="metric-label">OOOWEEE</span>
          </div>
          <div className="admin-card">
            <h4>Interventions Today</h4>
            <p className="metric-value">{adminStats.interventionsToday} / 10</p>
            <div className="mini-progress">
              <div style={{width: `${(adminStats.interventionsToday / 10) * 100}%`}}></div>
            </div>
          </div>
          <div className="admin-card">
            <h4>Tokens Used Today</h4>
            <p className="metric-value">{parseFloat(adminStats.tokensUsedToday).toFixed(0)}</p>
            <span className="metric-label">/ 1,000,000</span>
          </div>
        </div>
        
        <div className="admin-grid-3">
          <div className="admin-card">
            <h4>Total ETH Captured</h4>
            <p className="metric-value">{parseFloat(adminStats.totalETHCaptured).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>ETH to Validators</h4>
            <p className="metric-value">{parseFloat(adminStats.totalETHSentToValidators).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>Total Interventions</h4>
            <p className="metric-value">{adminStats.totalInterventions}</p>
            <span className="metric-label">all time</span>
          </div>
        </div>
        
        {/* Emergency Controls */}
        <div className="emergency-controls-section">
          <h3>Emergency Controls</h3>
          <div className="control-buttons-grid">
            <button
              className="admin-btn secondary"
              onClick={manualStabilityCheck}
              disabled={loading}
            >
              Manual Check (0.01 ETH)
            </button>
            <button
              className="admin-btn warning"
              onClick={resetCircuitBreaker}
              disabled={loading || !adminStats.circuitBreakerTripped}
            >
              Reset Circuit Breaker
            </button>
            <button
              className="admin-btn secondary"
              onClick={toggleSystemChecks}
              disabled={loading}
            >
              {adminStats.systemChecksEnabled ? 'Pause Checks' : 'Resume Checks'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Validator Network */}
      <div className="admin-section">
        <h2>Validator Network</h2>
        <div className="admin-grid-4">
          <div className="admin-card">
            <h4>Active Validators</h4>
            <p className="metric-value">{validatorStats.validators}</p>
          </div>
          <div className="admin-card">
            <h4>From Stability</h4>
            <p className="metric-value">{parseFloat(validatorStats.fromStability).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>From Rewards</h4>
            <p className="metric-value">{parseFloat(validatorStats.fromRewards).toFixed(4)}</p>
            <span className="metric-label">ETH</span>
          </div>
          <div className="admin-card">
            <h4>Total Donations</h4>
            <p className="metric-value">{parseFloat(validatorStats.totalDonations).toFixed(4)}</p>
            <span className="metric-label">ETH ({validatorStats.donors} donors)</span>
          </div>
        </div>
        
        <div className="validator-progress-section">
          <h4>Progress to Next Validator</h4>
          <div className="validator-progress-bar">
            <div className="progress-fill" style={{ width: `${validatorStats.progress}%` }}></div>
          </div>
          <p className="progress-text">{parseFloat(validatorStats.pendingETH).toFixed(4)} / 32 ETH ({validatorStats.progress.toFixed(1)}%)</p>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="admin-section">
        <h2>Quick Actions</h2>
        <div className="action-buttons-grid">
          <button className="action-btn" onClick={() => window.location.reload()}>
            🔄 Refresh Dashboard
          </button>
          <button className="action-btn" onClick={() => console.log(adminStats)}>
            📋 Log Stats
          </button>
          <button className="action-btn" onClick={() => {
            const data = JSON.stringify(adminStats, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `oooweee-stats-${Date.now()}.json`;
            a.click();
          }}>
            💾 Export Stats
          </button>
        </div>
      </div>
      
      <div className="refresh-indicator">
        <span className="refresh-dot"></span>
        Auto-refreshing every 5 seconds
      </div>
    </div>
  );

  return (
    <div className="App">
      <Toaster position="top-right" />
      
      {showBuyModal && (
        <div className="modal-overlay" onClick={() => { setShowBuyModal(false); setRequiredOooweeeForPurchase(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Buy $OOOWEEE</h2>
            <button className="close-modal" onClick={() => { setShowBuyModal(false); setRequiredOooweeeForPurchase(null); }}>✕</button>
            
            <div className="buy-form">
              <div className="balance-info">
                <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
                <p>Current Rate: 1 ETH = {(1/oooweeePrice).toFixed(0)} OOOWEEE</p>
              </div>
              
              {requiredOooweeeForPurchase ? (
                <>
                  <div className="output-estimate">
                    <p>You need exactly:</p>
                    <h3>{Math.ceil(requiredOooweeeForPurchase).toLocaleString()} $OOOWEEE</h3>
                    <p className="fiat-value">≈ {ethToBuy} ETH (with 5% buffer)</p>
                  </div>
                  
                  <button 
                    className="buy-btn rainbow-btn"
                    onClick={buyExactOooweee}
                    disabled={loading}
                  >
                    {loading ? '⏳ Processing...' : `🚀 Buy Exactly ${Math.ceil(requiredOooweeeForPurchase).toLocaleString()} OOOWEEE`}
                  </button>
                  
                  <button 
                    className="secondary-btn"
                    onClick={() => setRequiredOooweeeForPurchase(null)}
                    style={{ marginTop: '0.5rem', background: 'transparent', border: '2px solid #000', width: '100%', padding: '0.5rem', cursor: 'pointer' }}
                  >
                    Or buy a custom amount →
                  </button>
                </>
              ) : (
                <>
                  <div className="input-group">
                    <label>ETH Amount:</label>
                    <input
                      type="number"
                      value={ethToBuy}
                      onChange={(e) => setEthToBuy(e.target.value)}
                      min="0.001"
                      step="0.001"
                      max={ethBalance}
                    />
                  </div>
                  
                  <div className="output-estimate">
                    <p>You will receive approximately:</p>
                    <h3>{parseFloat(estimatedOooweee).toLocaleString()} $OOOWEEE</h3>
                    {ethPrice && (
                      <p className="fiat-value">≈ {getOooweeeInFiat(estimatedOooweee, selectedCurrency.toLowerCase())}</p>
                    )}
                  </div>
                  
                  <div className="quick-amounts">
                    <button onClick={() => setEthToBuy('0.01')}>0.01 ETH</button>
                    <button onClick={() => setEthToBuy('0.05')}>0.05 ETH</button>
                    <button onClick={() => setEthToBuy('0.1')}>0.1 ETH</button>
                    <button onClick={() => setEthToBuy('0.5')}>0.5 ETH</button>
                  </div>
                  
                  <button
                    className="buy-btn rainbow-btn"
                    onClick={buyOooweee}
                    disabled={loading || parseFloat(ethToBuy) <= 0}
                  >
                    {loading ? '⏳ Processing...' : '🚀 Swap for OOOWEEE'}
                  </button>

                  <div className="onramp-divider">
                    <span>or buy ETH directly with</span>
                  </div>

                  <button
                    className="fiat-onramp-btn"
                    onClick={() => { setShowBuyModal(false); openFiatOnramp(); }}
                  >
                    💳 Card / Google Pay / Apple Pay
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showDonateModal && (
        <div className="modal-overlay" onClick={() => { setShowDonateModal(false); setDonorMessage(''); setDonorName(''); setDonorLocation(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Donate to Validators</h2>
            <button className="close-modal" onClick={() => { setShowDonateModal(false); setDonorMessage(''); setDonorName(''); setDonorLocation(''); }}>✕</button>
            
            <div className="buy-form">
              <div className="balance-info">
                <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
                <p>Your donation helps fund Ethereum validators that generate rewards for savers!</p>
              </div>
              
              <div className="input-group">
                <label>ETH Amount:</label>
                <input
                  type="number"
                  value={donateAmount}
                  onChange={(e) => setDonateAmount(e.target.value)}
                  min="0.001"
                  step="0.01"
                  max={ethBalance}
                />
              </div>
              
              <div className="quick-amounts">
                <button onClick={() => setDonateAmount('0.01')}>0.01 ETH</button>
                <button onClick={() => setDonateAmount('0.05')}>0.05 ETH</button>
                <button onClick={() => setDonateAmount('0.1')}>0.1 ETH</button>
                <button onClick={() => setDonateAmount('0.5')}>0.5 ETH</button>
              </div>
              
              {parseFloat(donateAmount) >= 0.05 ? (
                <>
                  <div className="sponsor-tier-notice">
                    <p>🌟 Sponsor tier! Your name & message will be saved on-chain forever.</p>
                  </div>
                  <div className="donor-info-fields">
                    <div className="input-group">
                      <label>Your Name (optional):</label>
                      <input
                        type="text"
                        value={donorName}
                        onChange={(e) => setDonorName(e.target.value.slice(0, 50))}
                        placeholder="Anonymous"
                        maxLength={50}
                      />
                    </div>

                    <div className="input-group">
                      <label>Location (optional):</label>
                      <input
                        type="text"
                        value={donorLocation}
                        onChange={(e) => setDonorLocation(e.target.value.slice(0, 50))}
                        placeholder="e.g. Dublin, Ireland"
                        maxLength={50}
                      />
                    </div>
                  </div>

                  <div className="input-group message-group">
                    <label>Your Message (optional):</label>
                    <textarea
                      value={donorMessage}
                      onChange={(e) => setDonorMessage(e.target.value.slice(0, 180))}
                      placeholder="Leave a message for the community..."
                      maxLength={180}
                      rows={3}
                    />
                    <span className="char-count">{donorMessage.length}/180</span>
                  </div>

                  {(donorName.trim() || donorMessage.trim() || donorLocation.trim()) && (
                    <div className="info-notice">
                      <p>ℹ️ Donation includes gas fees for sponsor registration.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="info-notice">
                  <p>💡 Donate 0.05+ ETH to become a sponsor — your name & message saved on-chain forever!</p>
                </div>
              )}

              <button
                className="buy-btn"
                onClick={handleDonateSubmit}
                disabled={loading || parseFloat(donateAmount) <= 0 || parseFloat(donateAmount) > parseFloat(ethBalance)}
              >
                {loading ? '⏳ Processing...' : `💝 Donate ${donateAmount} ETH`}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content create-modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Savings Account</h2>
            <button className="close-modal" onClick={() => setShowCreateModal(false)}>✕</button>
            
            <div className="buy-form">
              <div className="form-group">
                <label>Account Type:</label>
                <select 
                  id="accountType" 
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="select-input"
                >
                  <option value="time">Time Lock - Lock until date</option>
                  <option value="growth">Growth Goal - Grow to target</option>
                  <option value="balance">Transfer Goal - Send at target</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Display Currency:</label>
                <select 
                  value={accountCurrency}
                  onChange={(e) => setAccountCurrency(e.target.value)}
                  className="select-input"
                >
                  {Object.entries(CURRENCIES).map(([code, info]) => (
                    <option key={code} value={code}>{info.symbol} {info.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Account Name:</label>
                <input 
                  type="text" 
                  placeholder="e.g., Epic Vacation" 
                  id="goalName"
                  className="text-input"
                />
              </div>
              
              <div className="form-group">
                <label>Initial Deposit ({CURRENCIES[accountCurrency].symbol}):</label>
                <input 
                  type="number" 
                  placeholder={`Deposit in ${CURRENCIES[accountCurrency].name}`}
                  id="initialDeposit"
                  min="10"
                  step="1"
                  value={initialDepositInput}
                  onChange={(e) => setInitialDepositInput(e.target.value)}
                  className="number-input"
                />
                {initialDepositInput && (
                  <p className="conversion-note">
                    ≈ {convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase()).toLocaleString()} $OOOWEEE at current rate
                  </p>
                )}
                <p className="fee-note">1% creation fee from initial deposit</p>
                <p className="fee-note">📋 Minimum deposit: €10 equivalent</p>
                {initialDepositInput && parseFloat(initialDepositInput) < 10 && accountCurrency === 'EUR' && (
                  <p className="error-note">⚠️ Minimum deposit is €10</p>
                )}
                {(() => {
                  const oooweeeNeeded = convertFiatToOooweee(initialDepositInput, accountCurrency.toLowerCase());
                  return parseFloat(balance) < oooweeeNeeded && initialDepositInput ? (
                    <p className="swap-notice">⚠️ Insufficient balance - will offer to buy with ETH</p>
                  ) : null;
                })()}
              </div>
              
              {accountType === 'time' && (
                <div className="form-group">
                  <label>🗓️ Unlock Date:</label>
                  <input 
                    type="date" 
                    id="unlockDate"
                    min={new Date().toISOString().split('T')[0]}
                    className="date-input"
                  />
                </div>
              )}
              
              {(accountType === 'growth' || accountType === 'balance') && (
                <div className="form-group">
                  <label>🎯 Target Amount ({CURRENCIES[accountCurrency].symbol}):</label>
                  <input 
                    type="number" 
                    placeholder={`Target in ${CURRENCIES[accountCurrency].name}`}
                    id="targetAmount"
                    value={targetAmountInput}
                    onChange={(e) => setTargetAmountInput(e.target.value)}
                    min="1"
                    step="1"
                    className="number-input"
                  />
                  {targetAmountInput && (
                    <p className="conversion-note">
                      ≈ {convertFiatToOooweee(targetAmountInput, accountCurrency.toLowerCase()).toLocaleString()} $OOOWEEE at current rate
                    </p>
                  )}
                  {accountType === 'growth' && initialDepositInput && targetAmountInput && (
                    (() => {
                      if (parseFloat(initialDepositInput) >= parseFloat(targetAmountInput)) {
                        return <p className="error-note">⚠️ Target must be higher than initial deposit ({CURRENCIES[accountCurrency].symbol}{initialDepositInput})</p>;
                      }
                      return null;
                    })()
                  )}
                </div>
              )}
              
              {accountType === 'balance' && (
                <div className="form-group">
                  <label>📮 Recipient Address:</label>
                  <input 
                    type="text" 
                    placeholder="0x..." 
                    id="recipientAddress"
                    className="text-input"
                  />
                  <p className="info-note">Auto-sends when target + 1% is reached</p>
                </div>
              )}
              
              <button 
                onClick={() => { handleCreateAccount(); setShowCreateModal(false); }} 
                disabled={loading}
                className="buy-btn rainbow-btn"
              >
                {loading ? '⏳ Processing...' : '🚀 Create Savings Account'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <header className="App-header">
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'community' ? 'active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            Community
          </button>
          <button 
            className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            About
          </button>
          {account?.toLowerCase() === ADMIN_WALLET.toLowerCase() && (
            <button 
              className={`tab-btn admin-tab ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              Admin
            </button>
          )}
        </div>

        {activeTab === 'about' ? (
          renderAboutPage()
        ) : activeTab === 'community' ? (
          renderCommunityPage()
        ) : activeTab === 'admin' && account?.toLowerCase() === ADMIN_WALLET.toLowerCase() ? (
          renderAdminDashboard()
        ) : (
          <>
            <div className="hero-section">
              <img src={oooweeLogo} alt="OOOWEEE" className="main-logo pixel-art" />
              <p className="tagline">OOOWEEE! Make your $aving goals non-negotiable!</p>
              
              {/* Price Ticker */}
              <div className="price-ticker">
                <div className="price-item">
                  <span className="price-label">OOOWEEE/ETH</span>
                  <span className={`price-value ${priceFlash ? `flash-${priceFlash}` : ''}`}>
                    {oooweeePrice > 0 ? oooweeePrice.toFixed(10) : '...'}
                  </span>
                </div>
                <div className="price-item">
                  <span className="price-label">OOOWEEE/{selectedCurrency}</span>
                  <span className={`price-value ${priceFlash ? `flash-${priceFlash}` : ''}`}>
                    {ethPrice?.[selectedCurrency.toLowerCase()]
                      ? formatCurrency(oooweeePrice * ethPrice[selectedCurrency.toLowerCase()], selectedCurrency)
                      : '...'}
                  </span>
                </div>
                <div className="price-item">
                  <span className="price-label">ETH/{selectedCurrency}</span>
                  <span className="price-value">
                    {ethPrice?.[selectedCurrency.toLowerCase()]
                      ? formatCurrency(ethPrice[selectedCurrency.toLowerCase()], selectedCurrency)
                      : '...'}
                  </span>
                </div>
              </div>
            </div>

            {!account ? (
              <div className="connect-section">
                <div className="welcome-card">
                  <h3>Welcome to OOOWEEE</h3>
                  <div className="feature-grid">
                    <div className="feature">
                      <span className="icon">🏦</span>
                      <h4>Like a Bank Account</h4>
                      <p>Save money for your goals</p>
                    </div>
                    <div className="feature">
                      <span className="icon">🔒</span>
                      <h4>But More Secure</h4>
                      <p>Protected by blockchain</p>
                    </div>
                    <div className="feature">
                      <span className="icon">🌍</span>
                      <h4>Works Globally</h4>
                      <p>Send anywhere instantly</p>
                    </div>
                  </div>
                </div>
                <div className="connect-options">
                  <button onClick={connectSocialLogin} className="connect-btn social-btn" disabled={isConnecting || !web3auth}>
                    {isConnecting ? 'Signing in...' : 'Sign in with Google / Email'}
                  </button>

                  <div className="divider-text">
                    <span>or</span>
                  </div>

                  <button onClick={connectWallet} className="connect-btn wallet-btn" disabled={isConnecting}>
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                  <p className="info-text">Works with MetaMask, Trust Wallet, and more!</p>
                </div>
                <p className="disclaimer">Values shown in your selected currency are estimates based on current market rates</p>
              </div>
            ) : (
              <div className="dashboard">
                <div className="wallet-info">
                  <div className="wallet-card">
                    <div className="wallet-header">
                      <h3>Wallet</h3>
                      <span className="address">{account.slice(0, 6)}...{account.slice(-4)}</span>
                      <button onClick={disconnectWallet} className="disconnect-btn">Disconnect</button>
                    </div>
                    
                    <div className="currency-toggle">
                      <button
                        className={`toggle-btn ${!showFiat ? 'active' : ''}`}
                        onClick={() => setShowFiat(false)}
                      >
                        Crypto
                      </button>
                      <select
                        className={`currency-select ${showFiat ? 'active' : ''}`}
                        value={selectedCurrency}
                        onChange={(e) => {
                          setSelectedCurrency(e.target.value);
                          setShowFiat(true);
                        }}
                        onClick={() => setShowFiat(true)}
                      >
                        {Object.entries(CURRENCIES).map(([code, info]) => (
                          <option key={code} value={code}>{info.symbol} {code}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="balance-row">
                      <span>ETH:</span>
                      <span>{parseFloat(ethBalance).toFixed(4)} ETH</span>
                    </div>
                    
                    <div className="balance-row highlight">
                      <span>$OOOWEEE:</span>
                      <span>
                        {!showFiat
                          ? `${parseFloat(balance).toLocaleString()} $OOOWEEE`
                          : getOooweeeInFiat(balance, selectedCurrency.toLowerCase())
                        }
                      </span>
                    </div>
                    {showFiat && (
                      <p className="conversion-note">≈ {parseFloat(balance).toLocaleString()} $OOOWEEE</p>
                    )}
                    
                    {parseFloat(balance) === 0 && (
                      <div className="zero-balance-notice">
                        <p>No OOOWEEE yet? Get started!</p>
                      </div>
                    )}
                    
                    <button
                      className="add-oooweee-btn rainbow-btn"
                      onClick={() => setShowBuyModal(true)}
                    >
                      Buy $OOOWEEE
                    </button>

                    <button
                      className="fiat-onramp-btn"
                      onClick={openFiatOnramp}
                    >
                      💳 Buy with Card
                    </button>

                    <button
                      className="create-savings-btn"
                      onClick={() => setShowCreateModal(true)}
                    >
                      New Savings Account
                    </button>
                  </div>
                </div>

                <div className="savings-section">
                  {activeAccounts.length > 0 && (
                    <>
                      <div className="section-header">
                        <h2>Your Accounts</h2>
                        {activeAccounts.some(acc => parseFloat(acc.pendingRewards) > 0) && (
                          <button className="claim-all-btn" onClick={claimAllRewards} disabled={loading}>
                            Claim All Rewards
                          </button>
                        )}
                      </div>
                      <div className="accounts-grid">
                        {activeAccounts.map(acc => {
                          const currency = getCurrencyFromCode(acc.targetCurrency);
                          const currencyInfo = CURRENCIES[currency];
                          
                          return (
                            <div key={acc.id} className={`account-card ${acc.type === 'Time' ? 'time-lock' : acc.type === 'Growth' ? 'growth-goal' : 'balance-transfer'}`}>
                              <div className="account-header">
                                <h3>{acc.goalName}</h3>
                                <span className={`account-type ${acc.type.toLowerCase()}`}>{acc.type}</span>
                              </div>
                              
                              <div className="account-details">
                                {acc.isFiatTarget ? (
                                  <div className="fiat-target-display">
                                    {(acc.type === 'Growth' || acc.type === 'Balance') && (
                                      <div className="detail-row">
                                        <span>Target:</span>
                                        <span className="primary-amount">
                                          {currencyInfo.symbol}
                                          {(acc.targetFiat / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                        </span>
                                      </div>
                                    )}
                                    
                                    <div className="detail-row">
                                      <span>Current Value:</span>
                                      <span className="primary-amount">
                                        {currencyInfo.symbol}
                                        {(acc.currentFiatValue / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                      </span>
                                    </div>
                                    
                                    <div className="balance-in-tokens">
                                      <span className="secondary-amount">
                                        {parseFloat(acc.balance).toLocaleString()} $OOOWEEE
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="balance-display">
                                    <div className="detail-row">
                                      <span>Balance:</span>
                                      <span className="primary-amount">
                                        {!showFiat
                                          ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                          : getOooweeeInFiat(acc.balance, selectedCurrency.toLowerCase())
                                        }
                                      </span>
                                    </div>
                                    {showFiat && (
                                      <span className="secondary-amount">
                                        ≈ {parseFloat(acc.balance).toLocaleString()} $OOOWEEE
                                      </span>
                                    )}
                                  </div>
                                )}

                                {acc.type === 'Time' && (
                                  <div className="detail-row">
                                    <span>Days Remaining:</span>
                                    <span className="value">{getDaysRemaining(acc.unlockTime)}</span>
                                  </div>
                                )}
                                
                                {acc.type === 'Growth' && !acc.isFiatTarget && (
                                  <div className="detail-row">
                                    <span>Target:</span>
                                    <span className="value">
                                      {!showFiat
                                        ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                        : getOooweeeInFiat(acc.target, selectedCurrency.toLowerCase())
                                      }
                                    </span>
                                  </div>
                                )}
                                
                                {acc.type === 'Balance' && (
                                  <>
                                    {!acc.isFiatTarget && (
                                      <div className="detail-row">
                                        <span>Target:</span>
                                        <span className="value">
                                          {!showFiat
                                            ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                            : getOooweeeInFiat(acc.target, selectedCurrency.toLowerCase())
                                          }
                                        </span>
                                      </div>
                                    )}
                                    <div className="detail-row">
                                      <span>To:</span>
                                      <span className="value address">{acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}</span>
                                    </div>
                                    <p className="info-note">Need 101% for auto-transfer</p>
                                  </>
                                )}
                                
                                <div className="progress-section">
                                  <div className="progress-bar">
                                    <div 
                                      className="progress-fill rainbow-fill"
                                      style={{ width: `${Math.min(acc.progress, 100)}%` }}
                                    />
                                  </div>
                                  <span className="progress-text">{acc.progress}% Complete</span>
                                </div>
                              </div>
                              
                              <div className="deposit-section">
                                {(() => {
                                  const currency = acc.isFiatTarget ? getCurrencyFromCode(acc.targetCurrency) : 'EUR';
                                  return (
                                    <>
                                      <label className="deposit-label">Deposit ({currency})</label>
                                      <input 
                                        type="number" 
                                        placeholder={`Amount in ${currency}`}
                                        id={`deposit-${acc.id}`}
                                        min="1"
                                        step="1"
                                        className="deposit-input"
                                        onChange={(e) => {
                                          const fiatAmount = e.target.value;
                                          const oooweeeAmount = convertFiatToOooweee(fiatAmount, currency);
                                          const converter = document.getElementById(`deposit-convert-${acc.id}`);
                                          if (converter) {
                                            converter.textContent = fiatAmount && fiatAmount > 0 
                                              ? `≈ ${oooweeeAmount.toLocaleString()} OOOWEEE`
                                              : '';
                                          }
                                        }}
                                      />
                                      <span id={`deposit-convert-${acc.id}`} className="deposit-conversion"></span>
                                    </>
                                  );
                                })()}
                                <button 
                                  onClick={() => {
                                    const currency = acc.isFiatTarget ? getCurrencyFromCode(acc.targetCurrency) : 'EUR';
                                    const fiatAmount = document.getElementById(`deposit-${acc.id}`).value;
                                    if (fiatAmount && fiatAmount > 0) {
                                      const oooweeeAmount = convertFiatToOooweee(fiatAmount, currency);
                                      if (oooweeeAmount > 0) {
                                        depositToAccount(acc.id, oooweeeAmount.toString());
                                      } else {
                                        toast.error('Amount too small');
                                      }
                                    } else {
                                      toast.error('Enter an amount');
                                    }
                                  }}
                                  disabled={loading}
                                  className="deposit-btn"
                                >
                                  DEPOSIT
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                
                {completedAccounts.length > 0 && (
                  <>
                    <div className="toggle-completed">
                      <button onClick={() => setShowCompleted(!showCompleted)} className="toggle-btn">
                        {showCompleted ? '📦 Hide' : '👁️ Show'} Completed ({completedAccounts.length})
                      </button>
                    </div>
                    
                    {showCompleted && (
                      <div className="completed-section">
                        <h3>Completed Accounts</h3>
                        <div className="accounts-grid">
                          {completedAccounts.map(acc => {
                            const currency = getCurrencyFromCode(acc.targetCurrency);
                            const currencyInfo = CURRENCIES[currency];
                            
                            return (
                              <div key={acc.id} className={`account-card completed ${acc.type === 'Time' ? 'time-lock' : acc.type === 'Growth' ? 'growth-goal' : 'balance-transfer'}`}>
                                <div className="account-header">
                                  <h3>{acc.goalName}</h3>
                                  <div className="header-badges">
                                    <span className={`account-type ${acc.type.toLowerCase()}`}>
                                      {acc.type}
                                    </span>
                                    <span className="currency-badge">{currency}</span>
                                  </div>
                                </div>
                                
                                <div className="account-details">
                                  <p className="completed-text">Goal Complete!</p>
                                  
                                  {acc.isFiatTarget ? (
                                    <>
                                      {(acc.type === 'Growth' || acc.type === 'Balance') && (
                                        <div className="detail-row">
                                          <span>Target Reached:</span>
                                          <span className="value">
                                            {currencyInfo.symbol}
                                            {(acc.targetFiat / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                          </span>
                                        </div>
                                      )}
                                      <div className="detail-row">
                                        <span>Final Value:</span>
                                        <span className="value">
                                          {currencyInfo.symbol}
                                          {(acc.currentFiatValue / Math.pow(10, currencyInfo.decimals)).toFixed(currencyInfo.decimals)}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="detail-row">
                                      <span>Final Balance:</span>
                                      <span className="value">
                                        {!showFiat
                                          ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                          : getOooweeeInFiat(acc.balance, selectedCurrency.toLowerCase())
                                        }
                                      </span>
                                    </div>
                                  )}
                                  
                                  {acc.type === 'Time' && acc.unlockTime > 0 && (
                                    <div className="detail-row secondary">
                                      <span>Unlocked:</span>
                                      <span className="value">
                                        {new Date(acc.unlockTime * 1000).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {acc.type === 'Balance' && acc.recipient && (
                                    <div className="detail-row secondary">
                                      <span>Sent to:</span>
                                      <span className="value address">
                                        {acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}
                                      </span>
                                    </div>
                                  )}
                                  
                                  <div className="progress-section">
                                    <div className="progress-bar">
                                      <div 
                                        className="progress-fill rainbow-fill"
                                        style={{ width: '100%' }}
                                      />
                                    </div>
                                    <span className="progress-text">100% Complete ✨</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </header>
    </div>
  );
}

export default App;