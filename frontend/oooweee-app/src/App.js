import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';
import oooweeLogo from './assets/oooweee-logo.png';
import { OOOWEEE_TOKEN_ABI, OOOWEEE_SAVINGS_ABI, OOOWEEE_VALIDATORS_ABI, CONTRACT_ADDRESSES } from './contracts/abis';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

// Uniswap Router ABI (minimal)
const UNISWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)",
  "function WETH() external pure returns (address)"
];

// Contract addresses
const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

// Currency configuration
const CURRENCIES = {
  USD: { code: 0, symbol: '$', name: 'US Dollar', decimals: 2, locale: 'en-US' },
  EUR: { code: 1, symbol: '€', name: 'Euro', decimals: 2, locale: 'en-IE' },
  GBP: { code: 2, symbol: '£', name: 'British Pound', decimals: 2, locale: 'en-GB' },
  JPY: { code: 3, symbol: '¥', name: 'Japanese Yen', decimals: 0, locale: 'ja-JP' },
  CNY: { code: 4, symbol: '¥', name: 'Chinese Yuan', decimals: 2, locale: 'zh-CN' },
  CAD: { code: 5, symbol: 'C$', name: 'Canadian Dollar', decimals: 2, locale: 'en-CA' },
  AUD: { code: 6, symbol: 'A$', name: 'Australian Dollar', decimals: 2, locale: 'en-AU' },
  CHF: { code: 7, symbol: 'CHF', name: 'Swiss Franc', decimals: 2, locale: 'de-CH' },
  INR: { code: 8, symbol: '₹', name: 'Indian Rupee', decimals: 2, locale: 'en-IN' },
  KRW: { code: 9, symbol: '₩', name: 'Korean Won', decimals: 0, locale: 'ko-KR' }
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
        mobileLinks: [
          "metamask",
          "trust",
          "rainbow",
          "argent",
          "imtoken",
          "pillar",
          "coinbase"
        ]
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
  const [validatorsContract, setValidatorsContract] = useState(null);
  const [routerContract, setRouterContract] = useState(null);
  const [balance, setBalance] = useState('0');
  const [ethBalance, setEthBalance] = useState('0');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('time');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [ethPrice, setEthPrice] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState('fiat');
  const [web3Modal, setWeb3Modal] = useState(null);
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [initialDepositInput, setInitialDepositInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [ethToBuy, setEthToBuy] = useState('0.01');
  const [estimatedOooweee, setEstimatedOooweee] = useState('0');
  const [accountCurrency, setAccountCurrency] = useState('EUR');
  
  // Validator stats
  const [validatorStats, setValidatorStats] = useState({
    validators: 0,
    nextValidatorIn: '32',
    progress: 0,
    pendingETH: '0',
    donors: 0,
    totalDonations: '0'
  });

  // OOOWEEE to ETH conversion rate (will be updated from pool)
  const [oooweeePrice, setOooweeePrice] = useState(0.00001);

  // Initialize Web3Modal
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    const modal = new Web3Modal({
      network: "sepolia",
      cacheProvider: false,
      providerOptions,
      disableInjectedProvider: false,
      theme: {
        background: "rgb(39, 49, 56)",
        main: "rgb(199, 199, 199)",
        secondary: "rgb(136, 136, 136)",
        border: "rgba(195, 195, 195, 0.14)",
        hover: "rgb(16, 26, 32)"
      }
    });
    
    if (isMobile && modal.cachedProvider) {
      modal.clearCachedProvider();
    }
    
    setWeb3Modal(modal);
  }, []);

  // Loading screen
  useEffect(() => {
    setTimeout(() => setIsAppLoading(false), 2000);
  }, []);

  // Fetch ETH price
  useEffect(() => {
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchEthPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp,jpy,cny,cad,aud,chf,inr,krw');
      const data = await response.json();
      setEthPrice(data.ethereum);
    } catch (error) {
      console.error('Failed to fetch ETH price');
      // Set fallback prices
      setEthPrice({
        usd: 2000,
        eur: 1850,
        gbp: 1600,
        jpy: 300000,
        cny: 14000,
        cad: 2700,
        aud: 3100,
        chf: 1800,
        inr: 166000,
        krw: 2650000
      });
    }
  };

  // Format currency properly
  const formatCurrency = (amount, currencyCode) => {
    const currency = CURRENCIES[currencyCode.toUpperCase()];
    if (!currency) return amount;
    
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals
    }).format(amount);
  };

  // Get OOOWEEE price from router
  const updateOooweeePrice = useCallback(async () => {
    if (!routerContract) return;
    
    try {
      const ethAmount = ethers.utils.parseEther("1");
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const oooweeePerEth = parseFloat(ethers.utils.formatUnits(amounts[1], 18));
      setOooweeePrice(1 / oooweeePerEth);
    } catch (error) {
      console.error('Error fetching OOOWEEE price:', error);
    }
  }, [routerContract]);

  // Update OOOWEEE price when router is available
  useEffect(() => {
    if (routerContract) {
      updateOooweeePrice();
      const interval = setInterval(updateOooweeePrice, 30000);
      return () => clearInterval(interval);
    }
  }, [routerContract, updateOooweeePrice]);

  // Estimate OOOWEEE output
  useEffect(() => {
    const estimateOooweee = async () => {
      if (!routerContract || !ethToBuy || parseFloat(ethToBuy) <= 0) {
        setEstimatedOooweee('0');
        return;
      }
      
      try {
        const ethAmount = ethers.utils.parseEther(ethToBuy);
        const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
        const amounts = await routerContract.getAmountsOut(ethAmount, path);
        setEstimatedOooweee(ethers.utils.formatUnits(amounts[1], 18));
      } catch (error) {
        setEstimatedOooweee('0');
      }
    };
    
    estimateOooweee();
  }, [ethToBuy, routerContract]);

  const loadValidatorStats = useCallback(async () => {
    try {
      const stats = await validatorsContract.getStats();
      const ethNeeded = await validatorsContract.ethUntilNextValidator();
      const [progress] = await validatorsContract.progressToNextValidator();
      
      setValidatorStats({
        validators: stats[0].toString(),
        nextValidatorIn: ethers.utils.formatEther(ethNeeded),
        progress: (parseFloat(ethers.utils.formatEther(progress)) / 32) * 100,
        pendingETH: ethers.utils.formatEther(stats[1]),
        totalDonations: ethers.utils.formatEther(stats[4]),
        donors: stats[5].toString()
      });
    } catch (error) {
      console.error('Error loading validator stats:', error);
    }
  }, [validatorsContract]);

  // Load validator stats
  useEffect(() => {
    if (validatorsContract) {
      loadValidatorStats();
      const interval = setInterval(loadValidatorStats, 10000);
      return () => clearInterval(interval);
    }
  }, [validatorsContract, loadValidatorStats]);

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

  // Buy OOOWEEE with ETH
  const buyOooweee = async () => {
    if (!ethToBuy || parseFloat(ethToBuy) <= 0) {
      toast.error('Enter a valid ETH amount');
      return;
    }
    
    try {
      setLoading(true);
      
      const ethAmount = ethers.utils.parseEther(ethToBuy);
      const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // Get minimum output (with 2% slippage)
      const amounts = await routerContract.getAmountsOut(ethAmount, path);
      const minOutput = amounts[1].mul(98).div(100);
      
      const tx = await routerContract.swapExactETHForTokens(
        minOutput,
        path,
        account,
        deadline,
        { value: ethAmount }
      );
      
      await toast.promise(
        tx.wait(),
        {
          loading: '🔄 Swapping ETH for OOOWEEE...',
          success: `🎉 Bought ${parseFloat(estimatedOooweee).toFixed(2)} OOOWEEE!`,
          error: '❌ Swap failed'
        }
      );
      
      setShowBuyModal(false);
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

  // Buy and create account
  const buyAndCreateAccount = async (requiredOooweee) => {
    const requiredEth = requiredOooweee * oooweeePrice * 1.05; // Add 5% buffer
    
    const result = await toast.promise(
      new Promise(async (resolve, reject) => {
        try {
          setLoading(true);
          
          const ethAmount = ethers.utils.parseEther(requiredEth.toFixed(6));
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
          const deadline = Math.floor(Date.now() / 1000) + 3600;
          
          const amounts = await routerContract.getAmountsOut(ethAmount, path);
          const minOutput = amounts[1].mul(98).div(100);
          
          const tx = await routerContract.swapExactETHForTokens(
            minOutput,
            path,
            account,
            deadline,
            { value: ethAmount }
          );
          
          await tx.wait();
          await loadBalances(account, provider, tokenContract);
          resolve(true);
        } catch (error) {
          reject(error);
        } finally {
          setLoading(false);
        }
      }),
      {
        loading: '🔄 Buying OOOWEEE first...',
        success: '✅ OOOWEEE purchased! Now creating account...',
        error: '❌ Failed to buy OOOWEEE'
      }
    );
    
    return result;
  };

  // Connect Wallet
  const connectWallet = async () => {
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isWalletBrowser = typeof window.ethereum !== 'undefined';
      
      let instance, provider, signer, address;
      
      // Mobile wallet browser - connect directly
      if (isMobile && isWalletBrowser) {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        if (accounts.length > 0) {
          provider = new ethers.providers.Web3Provider(window.ethereum);
          signer = provider.getSigner();
          address = await signer.getAddress();
          instance = window.ethereum;
        }
      } else if (!isMobile) {
        // Desktop - use Web3Modal
        if (web3Modal && web3Modal.cachedProvider) {
          web3Modal.clearCachedProvider();
        }
        
        instance = await web3Modal.connect();
        provider = new ethers.providers.Web3Provider(instance);
        signer = provider.getSigner();
        address = await signer.getAddress();
      }
      
      // Check network
      const network = await provider.getNetwork();
      if (network.chainId !== 11155111) {
        try {
          await instance.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await instance.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: {
                  name: 'Sepolia ETH',
                  symbol: 'SEP',
                  decimals: 18
                },
                rpcUrls: ['https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
              }]
            });
          }
        }
      }
      
      // Initialize contracts
      const tokenContract = new ethers.Contract(
        CONTRACT_ADDRESSES.token,
        OOOWEEE_TOKEN_ABI,
        signer
      );
      
      const savingsContract = new ethers.Contract(
        CONTRACT_ADDRESSES.savings,
        OOOWEEE_SAVINGS_ABI,
        signer
      );

      const validatorsContract = new ethers.Contract(
        CONTRACT_ADDRESSES.validators,
        OOOWEEE_VALIDATORS_ABI,
        signer
      );
      
      const routerContract = new ethers.Contract(
        UNISWAP_ROUTER,
        UNISWAP_ROUTER_ABI,
        signer
      );
      
      setAccount(address);
      setProvider(provider);
      setTokenContract(tokenContract);
      setSavingsContract(savingsContract);
      setValidatorsContract(validatorsContract);
      setRouterContract(routerContract);
      
      toast.success('Wallet connected! OOOWEEE!');
      
      loadBalances(address, provider, tokenContract);
      loadSavingsAccounts(address, savingsContract);
      
      // Event listeners
      instance.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          window.location.reload();
        }
      });

      instance.on("chainChanged", () => {
        window.location.reload();
      });
      
    } catch (error) {
      console.error('Wallet connection error:', error);
      toast.error(error.message?.includes('User rejected') ? 
        'Connection cancelled' : 
        'Failed to connect wallet'
      );
    }
  };

  // Donate to validators
  const donateToValidators = async () => {
    const amount = prompt("How much ETH would you like to donate to bootstrap validators?");
    if (amount && parseFloat(amount) >= 0.001) {
      try {
        setLoading(true);
        const tx = await validatorsContract.donate({
          value: ethers.utils.parseEther(amount)
        });
        
        await toast.promise(
          tx.wait(),
          {
            loading: '💎 Sending donation...',
            success: `🎉 Thank you! Donated ${amount} ETH to validators!`,
            error: '❌ Donation failed'
          }
        );
        
        await loadValidatorStats();
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
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
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
    setValidatorsContract(null);
    setRouterContract(null);
    setBalance('0');
    setEthBalance('0');
    setAccounts([]);
  };

  const loadBalances = async (account, provider, tokenContract) => {
    try {
      const tokenBal = await tokenContract.balanceOf(account);
      setBalance(ethers.utils.formatUnits(tokenBal, 18));
      
      const ethBal = await provider.getBalance(account);
      setEthBalance(ethers.utils.formatEther(ethBal));
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  const loadSavingsAccounts = async (account, savingsContract) => {
    try {
      const accountIds = await savingsContract.getUserAccounts(account);
      const accountDetails = [];
      
      for (let id of accountIds) {
        try {
          // Try to get extended info first
          const info = await savingsContract.getAccountInfoExtended(account, id);
          accountDetails.push({
            id: id.toString(),
            type: info[0],
            goalName: info[1],
            balance: ethers.utils.formatUnits(info[2], 18),
            target: ethers.utils.formatUnits(info[3], 18),
            targetFiat: info[4].toNumber(),
            targetCurrency: info[5],
            currentFiatValue: info[6].toNumber(),
            unlockTime: info[7].toString(),
            recipient: info[8],
            isActive: info[9],
            progress: info[10].toString(),
            pendingRewards: ethers.utils.formatUnits(info[11], 18),
            isFiatTarget: info[12]
          });
        } catch (extendedError) {
          // Fall back to legacy getAccountInfo
          const info = await savingsContract.getAccountInfo(account, id);
          accountDetails.push({
            id: id.toString(),
            type: info[0],
            goalName: info[1],
            balance: ethers.utils.formatUnits(info[2], 18),
            target: ethers.utils.formatUnits(info[3], 18),
            targetFiat: 0,
            targetCurrency: 1, // Default to EUR
            currentFiatValue: 0,
            unlockTime: info[4].toString(),
            recipient: info[5],
            isActive: info[6],
            progress: info[7].toString(),
            pendingRewards: ethers.utils.formatUnits(info[8], 18),
            isFiatTarget: false
          });
        }
      }
      
      setAccounts(accountDetails);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const createTimeAccount = async (unlockDate, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check if user has enough OOOWEEE
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          await buyAndCreateAccount(needed);
        } else {
          setLoading(false);
          return;
        }
      }
      
      const unlockTime = Math.floor(new Date(unlockDate).getTime() / 1000);
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createTimeAccountFiat(
        unlockTime,
        goalName,
        depositAmount,
        CURRENCIES[currency].code
      );
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🐷 Creating piggy bank...',
          success: `🎉 Time account created with ${initialDeposit} $OOOWEEE! (1% fee applied)`,
          error: '❌ Failed to create account'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  const createGrowthAccount = async (targetAmount, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check if user has enough OOOWEEE
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          await buyAndCreateAccount(needed);
        } else {
          setLoading(false);
          return;
        }
      }
      
      // Convert target to smallest unit (cents, pence, etc)
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createGrowthAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        goalName,
        depositAmount
      );
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '🌱 Planting seed...',
          success: `🌳 Growth account created! Target: ${formatCurrency(targetAmount, currency)}`,
          error: '❌ Failed to create account'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  const createBalanceAccount = async (targetAmount, recipientAddress, goalName, initialDeposit, currency) => {
    try {
      setLoading(true);
      
      // Check if user has enough OOOWEEE
      if (parseFloat(balance) < parseFloat(initialDeposit)) {
        const needed = parseFloat(initialDeposit) - parseFloat(balance);
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          await buyAndCreateAccount(needed);
        } else {
          setLoading(false);
          return;
        }
      }
      
      // Convert target to smallest unit
      const targetInSmallestUnit = Math.round(targetAmount * Math.pow(10, CURRENCIES[currency].decimals));
      const depositAmount = ethers.utils.parseUnits(initialDeposit.toString(), 18);
      
      if (!ethers.utils.isAddress(recipientAddress)) {
        toast.error('Invalid recipient address');
        return;
      }
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const createTx = await savingsContract.createBalanceAccountFiat(
        targetInSmallestUnit,
        CURRENCIES[currency].code,
        recipientAddress,
        goalName,
        depositAmount
      );
      
      await toast.promise(
        createTx.wait(),
        {
          loading: '⚖️ Setting up scale...',
          success: `💸 Balance account created! Target: ${formatCurrency(targetAmount, currency)}`,
          error: '❌ Failed to create account'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
      await loadBalances(account, provider, tokenContract);
    } catch (error) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    const goalName = document.getElementById('goalName').value;
    const initialDeposit = document.getElementById('initialDeposit').value;
    
    if (!goalName) {
      toast.error('Please enter a goal name');
      return;
    }
    
    if (!initialDeposit || parseFloat(initialDeposit) <= 0) {
      toast.error('Please enter an initial deposit amount (any amount > 0)');
      return;
    }
    
    if (accountType === 'time') {
      const unlockDate = document.getElementById('unlockDate').value;
      if (!unlockDate) {
        toast.error('Please select an unlock date');
        return;
      }
      createTimeAccount(unlockDate, goalName, initialDeposit, accountCurrency);
    } else if (accountType === 'growth') {
      const targetAmount = document.getElementById('targetAmount').value;
      if (!targetAmount || targetAmount <= 0) {
        toast.error('Please enter a valid target amount');
        return;
      }
      createGrowthAccount(targetAmount, goalName, initialDeposit, accountCurrency);
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
      createBalanceAccount(targetAmount, recipientAddress, goalName, initialDeposit, accountCurrency);
    }
  };

  const depositToAccount = async (accountId, amount) => {
    try {
      setLoading(true);
      
      const depositAmountNumber = parseFloat(amount);
      const currentBalance = parseFloat(balance);
      
      // Check if user has enough OOOWEEE
      if (currentBalance < depositAmountNumber) {
        const needed = depositAmountNumber - currentBalance;
        
        if (window.confirm(`You need ${needed.toFixed(2)} more OOOWEEE. Buy with ETH now?`)) {
          const requiredEth = needed * oooweeePrice * 1.05; // 5% buffer for slippage
          
          // Check ETH balance
          if (parseFloat(ethBalance) < requiredEth) {
            toast.error(`Insufficient ETH. Need ${requiredEth.toFixed(4)} ETH`);
            setLoading(false);
            return;
          }
          
          const ethAmount = ethers.utils.parseEther(requiredEth.toFixed(6));
          const path = [WETH_ADDRESS, CONTRACT_ADDRESSES.token];
          const deadline = Math.floor(Date.now() / 1000) + 3600;
          
          // Get expected output with slippage
          const amounts = await routerContract.getAmountsOut(ethAmount, path);
          const minOutput = ethers.utils.parseUnits(needed.toFixed(0), 18).mul(98).div(100);
          
          const buyTx = await routerContract.swapExactETHForTokens(
            minOutput,
            path,
            account,
            deadline,
            { value: ethAmount }
          );
          
          await toast.promise(
            buyTx.wait(),
            {
              loading: `🔄 Buying ${needed.toFixed(0)} OOOWEEE...`,
              success: '✅ OOOWEEE purchased!',
              error: '❌ Failed to buy OOOWEEE'
            }
          );
          
          // Reload balance after purchase
          await loadBalances(account, provider, tokenContract);
        } else {
          setLoading(false);
          return;
        }
      }
      
      // Now deposit the originally requested amount
      const depositAmount = ethers.utils.parseUnits(depositAmountNumber.toString(), 18);
      
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESSES.savings, depositAmount);
      
      await toast.promise(
        approveTx.wait(),
        {
          loading: '🔓 Approving tokens...',
          success: '✅ Tokens approved!',
          error: '❌ Failed to approve'
        }
      );
      
      const depositTx = await savingsContract.deposit(accountId, depositAmount);
      
      await toast.promise(
        depositTx.wait(),
        {
          loading: `💰 Depositing ${depositAmountNumber} OOOWEEE...`,
          success: `🎉 Deposited ${depositAmountNumber} $OOOWEEE!`,
          error: '❌ Failed to deposit'
        }
      );
      
      await loadSavingsAccounts(account, savingsContract);
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

  // Get currency code from number
  const getCurrencyFromCode = (code) => {
    const currencies = Object.keys(CURRENCIES);
    return currencies[code] || 'EUR';
  };

  // Filter accounts
  const activeAccounts = accounts.filter(acc => acc.isActive);
  const completedAccounts = accounts.filter(acc => !acc.isActive);

  // Show loading screen
  if (isAppLoading) {
    return (
      <div className="loading-screen">
        <img 
          src={oooweeLogo} 
          alt="Loading..." 
          className="loading-logo pixel-art"
        />
        <div className="loading-bar">
          <div className="loading-progress"></div>
        </div>
        <p className="loading-text">Loading OOOWEEE Protocol...</p>
      </div>
    );
  }

  // Buy Modal
  const BuyModal = () => (
    <div className="modal-overlay" onClick={() => setShowBuyModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>🛒 Buy $OOOWEEE</h2>
        <button className="close-modal" onClick={() => setShowBuyModal(false)}>✕</button>
        
        <div className="buy-form">
          <div className="balance-info">
            <p>ETH Balance: {parseFloat(ethBalance).toFixed(4)} ETH</p>
            <p>Current Rate: 1 ETH = {(1/oooweeePrice).toFixed(0)} OOOWEEE</p>
          </div>
          
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
              <p className="fiat-value">
                ≈ {getOooweeeInFiat(estimatedOooweee, 'eur')}
              </p>
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
            disabled={loading || parseFloat(ethToBuy) <= 0 || parseFloat(ethToBuy) > parseFloat(ethBalance)}
          >
            {loading ? '⏳ Processing...' : '🚀 Buy OOOWEEE'}
          </button>
          
          <p className="slippage-note">
            ⚠️ Includes 2% slippage protection
          </p>
        </div>
      </div>
    </div>
  );

  // About page content
  const renderAboutPage = () => (
    <div className="about-page">
      <div className="about-hero">
        <img src={oooweeLogo} alt="OOOWEEE" className="about-logo pixel-art" />
        <h1>The OOOWEEE Protocol</h1>
        <p className="tagline">Financial Freedom Through Protected Savings</p>
      </div>

      <div className="vision-section">
        <h2>💭 Founder's Vision</h2>
        <div className="vision-card">
          <p className="vision-text">
            Today's world bombards us with advertisements designed to separate us from our money. 
            Every scroll, every click, every moment online is filled with temptations to spend on 
            things we don't need. This constant marketing assault is the invisible barrier keeping 
            people from climbing the financial ladder.
          </p>
          <p className="vision-text">
            <strong>You are your own worst enemy when it comes to financial independence.</strong> 
            That's why we built OOOWEEE - a protocol that makes your savings truly untouchable, 
            even by yourself. No compromise. No exceptions. Your future self will thank you.
          </p>
          <p className="vision-text">
            We're creating a shield against the ultra-invasive nature of modern marketing. 
            A tool that gives you the power to fight back against impulse spending and build 
            real wealth, one locked savings account at a time.
          </p>
        </div>
      </div>

      <div className="how-it-works">
        <h2>⚙️ How It Works</h2>
        
        <div className="feature-grid">
          <div className="feature-card">
            <span className="feature-icon">🔒</span>
            <h3>Smart Contract Savings</h3>
            <p>Your savings are locked in immutable smart contracts on Ethereum. Once created, 
            not even you can break your commitment. True financial discipline enforced by code.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🛡️</span>
            <h3>SSA Protection</h3>
            <p>The Speculative Spike Absorber (SSA) captures value from price pumps and converts 
            it to stable ETH for validator creation. This protects savers from speculation while 
            building long-term value.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🎯</span>
            <h3>Three Account Types</h3>
            <ul>
              <li><strong>Time Accounts:</strong> Lock until a specific date</li>
              <li><strong>Growth Accounts:</strong> Auto-unlock at target amount</li>
              <li><strong>Balance Accounts:</strong> Auto-send to recipient at target</li>
            </ul>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🔄</span>
            <h3>Circular Economy</h3>
            <p>Price spikes fund validators → Validators earn rewards → 33% to savers, 
            33% to operations, 34% to next validator. Continuous value creation long after 
            all 100M tokens are in circulation.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">💎</span>
            <h3>Validator Network</h3>
            <p>Community-funded Ethereum validators generate sustainable rewards. Every 32 ETH 
            accumulated creates a new validator, compounding returns for all savers.</p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">🌍</span>
            <h3>True Decentralization</h3>
            <p>Built on Ethereum mainnet, not Layer 2s. Your funds are truly decentralized 
            with no central authority able to freeze or confiscate them.</p>
          </div>
        </div>
      </div>

      <div className="tokenomics-section">
        <h2>📊 Tokenomics</h2>
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
        <h2>🚀 Join the Revolution</h2>
        <p>Take control of your financial future. Start saving with OOOWEEE today.</p>
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className="cta-button rainbow-btn"
        >
          Start Saving Now
        </button>
      </div>
    </div>
  );

  return (
    <div className="App">
      <Toaster position="top-right" />
      
      {/* Buy Modal */}
      {showBuyModal && <BuyModal />}
      
      {/* Floating coins background */}
      <div className="floating-coins">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="coin"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`
            }}
          >
            🪙
          </div>
        ))}
      </div>
      
      <header className="App-header">
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            🎮 Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            📖 About
          </button>
        </div>

        {activeTab === 'about' ? (
          renderAboutPage()
        ) : (
          <>
            <div className="hero-section">
              <img 
                src={oooweeLogo} 
                alt="OOOWEEE" 
                className="main-logo pixel-art"
              />
              <p className="tagline">OOOWEEE! Make your $aving goals non-negotiable!</p>
            </div>

            {!account ? (
              <div className="connect-section">
                <div className="welcome-card">
                  <h3>🎮 Welcome to Digital Savings!</h3>
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
                <button onClick={connectWallet} className="connect-btn rainbow-btn">
                  <span>🔗</span> Connect Wallet
                </button>
                <p className="info-text">Works with MetaMask, Trust Wallet, and more!</p>
                <p className="disclaimer">💡 Values shown in your selected currency are estimates based on current market rates</p>
              </div>
            ) : (
              <div className="dashboard">
                <div className="wallet-info">
                  <div className="wallet-card">
                    <div className="wallet-header">
                      <h3>💰 Wallet Status</h3>
                      <span className="address">{account.slice(0, 6)}...{account.slice(-4)}</span>
                      <button onClick={disconnectWallet} className="disconnect-btn">
                        Disconnect
                      </button>
                    </div>
                    
                    <div className="currency-toggle">
                      <button 
                        className={`toggle-btn ${displayCurrency === 'crypto' ? 'active' : ''}`}
                        onClick={() => setDisplayCurrency('crypto')}
                      >
                        🪙 Crypto
                      </button>
                      <button 
                        className={`toggle-btn ${displayCurrency === 'fiat' ? 'active' : ''}`}
                        onClick={() => setDisplayCurrency('fiat')}
                      >
                        💶 EUR
                      </button>
                    </div>
                    
                    <div className="balance-row">
                      <span>ETH:</span>
                      <span>{parseFloat(ethBalance).toFixed(4)} ETH</span>
                    </div>
                    
                    <div className="balance-row highlight">
                      <span>$OOOWEEE:</span>
                      <span>
                        {displayCurrency === 'crypto' 
                          ? `${parseFloat(balance).toLocaleString()} $OOOWEEE`
                          : getOooweeeInFiat(balance, 'eur')
                        }
                      </span>
                    </div>
                    {displayCurrency === 'fiat' && (
                      <p className="conversion-note">
                        ≈ {parseFloat(balance).toLocaleString()} $OOOWEEE
                      </p>
                    )}
                    
                    {parseFloat(balance) === 0 && (
                      <div className="zero-balance-notice">
                        <p>👋 No OOOWEEE yet? Get started!</p>
                      </div>
                    )}
                    
                    <button 
                      className="add-oooweee-btn rainbow-btn"
                      onClick={() => setShowBuyModal(true)}
                    >
                      🛒 Buy $OOOWEEE
                    </button>
                  </div>

                  {/* Validator Card */}
                  <div className="validator-card">
                    <div className="validator-header">
                      <h3>🔐 Validator Network</h3>
                    </div>
                    
                    <div className="stats-grid">
                      <div className="stat">
                        <span className="label">Active Validators</span>
                        <span className="value">{validatorStats.validators}</span>
                      </div>
                      
                      <div className="stat">
                        <span className="label">Next Validator In</span>
                        <span className="value">{parseFloat(validatorStats.nextValidatorIn).toFixed(2)} ETH</span>
                      </div>
                    </div>
                    
                    <div className="progress-bar">
                      <div 
                        className="progress-fill rainbow-fill" 
                        style={{ width: `${validatorStats.progress}%` }}
                      />
                      <span className="progress-text">
                        {(32 - parseFloat(validatorStats.nextValidatorIn)).toFixed(2)} / 32 ETH
                      </span>
                    </div>
                    
                    <div className="donation-info">
                      <p>🤝 {validatorStats.donors} donors contributed {parseFloat(validatorStats.totalDonations).toFixed(3)} ETH</p>
                    </div>
                    
                    <button 
                      className="donate-btn rainbow-btn"
                      onClick={donateToValidators}
                      disabled={loading}
                    >
                      💎 Donate ETH to Bootstrap Validators
                    </button>
                    
                    <p className="help-text">
                      Help launch validators to earn rewards for all OOOWEEE savers!
                    </p>
                  </div>
                </div>
                
                {/* Accounts section */}
                <div className="accounts-container">
                  <div className="section-header">
                    <h2>🎮 Active Savings Quests</h2>
                    {completedAccounts.length > 0 && (
                      <button 
                        className="toggle-completed"
                        onClick={() => setShowCompleted(!showCompleted)}
                      >
                        {showCompleted ? '👁️ Hide' : '👁️ Show'} Completed ({completedAccounts.length})
                      </button>
                    )}
                  </div>
                  
                  {activeAccounts.length === 0 && completedAccounts.length === 0 ? (
                    <div className="empty-state">
                      <p>🎯 No savings quests yet!</p>
                      <p>Start your first quest below!</p>
                    </div>
                  ) : (
                    <>
                      <div className="accounts-grid">
                        {activeAccounts.map(acc => {
                          const currencyCode = getCurrencyFromCode(acc.targetCurrency);
                          const currency = CURRENCIES[currencyCode];
                          
                          return (
                            <div key={acc.id} className="account-card active">
                              <div className="account-header">
                                <h3>{acc.goalName}</h3>
                                <div className="header-badges">
                                  <span className={`account-type ${acc.type.toLowerCase()}`}>
                                    {acc.type === 'Time' && '⏰'}
                                    {acc.type === 'Growth' && '🌱'}
                                    {acc.type === 'Balance' && '⚖️'}
                                    {acc.type}
                                  </span>
                                  {acc.isFiatTarget && (
                                    <span className="currency-badge">{currency.symbol}</span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="account-details">
                                {acc.isFiatTarget ? (
                                  <>
                                    <div className="balance-display">
                                      <div className="detail-row">
                                        <span>Current Value:</span>
                                        <span className="primary-amount">
                                          {formatCurrency(acc.currentFiatValue / Math.pow(10, currency.decimals), currencyCode)}
                                        </span>
                                      </div>
                                      {acc.type !== 'Time' && (
                                        <div className="detail-row">
                                          <span>Target:</span>
                                          <span className="value">
                                            {formatCurrency(acc.targetFiat / Math.pow(10, currency.decimals), currencyCode)}
                                          </span>
                                        </div>
                                      )}
                                      <div className="detail-row secondary">
                                        <span>OOOWEEE Balance:</span>
                                        <span>{parseFloat(acc.balance).toLocaleString()} tokens</span>
                                      </div>
                                      {parseFloat(acc.pendingRewards) > 0 && (
                                        <div className="detail-row rewards">
                                          <span>Pending Rewards:</span>
                                          <span className="value">+{parseFloat(acc.pendingRewards).toFixed(2)} $OOOWEEE</span>
                                        </div>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="balance-display">
                                      <div className="detail-row">
                                        <span>Balance:</span>
                                        <span className="primary-amount">
                                          {displayCurrency === 'crypto'
                                            ? `${parseFloat(acc.balance).toLocaleString()} $OOOWEEE`
                                            : getOooweeeInFiat(acc.balance, 'eur')
                                          }
                                        </span>
                                      </div>
                                      {parseFloat(acc.pendingRewards) > 0 && (
                                        <div className="detail-row rewards">
                                          <span>Pending Rewards:</span>
                                          <span className="value">+{parseFloat(acc.pendingRewards).toFixed(2)} $OOOWEEE</span>
                                        </div>
                                      )}
                                      {displayCurrency === 'fiat' && (
                                        <span className="secondary-amount">
                                          ≈ {parseFloat(acc.balance).toLocaleString()} $OOOWEEE
                                        </span>
                                      )}
                                    </div>
                                  </>
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
                                      {displayCurrency === 'crypto'
                                        ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                        : getOooweeeInFiat(acc.target, 'eur')
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
                                          {displayCurrency === 'crypto'
                                            ? `${parseFloat(acc.target).toLocaleString()} $OOOWEEE`
                                            : getOooweeeInFiat(acc.target, 'eur')
                                          }
                                        </span>
                                      </div>
                                    )}
                                    <div className="detail-row">
                                      <span>To:</span>
                                      <span className="value address">{acc.recipient.slice(0, 6)}...{acc.recipient.slice(-4)}</span>
                                    </div>
                                    <p className="info-note">📝 Need 101% for auto-transfer</p>
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
                                <input 
                                  type="number" 
                                  placeholder="Amount to deposit"
                                  id={`deposit-${acc.id}`}
                                  min="0.001"
                                  step="0.001"
                                  className="deposit-input"
                                />
                                <button 
                                  onClick={() => {
                                    const amount = document.getElementById(`deposit-${acc.id}`).value;
                                    if (amount && amount > 0) {
                                      depositToAccount(acc.id, amount);
                                    } else {
                                      toast.error('Enter an amount');
                                    }
                                  }}
                                  disabled={loading}
                                  className="deposit-btn"
                                >
                                  💰 DEPOSIT
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {showCompleted && completedAccounts.length > 0 && (
                        <div className="completed-section">
                          <h3>✅ Completed Quests</h3>
                          <div className="accounts-grid">
                            {completedAccounts.map(acc => (
                              <div key={acc.id} className="account-card completed">
                                <div className="account-header">
                                  <h3>{acc.goalName} ✅</h3>
                                  <span className={`account-type ${acc.type.toLowerCase()}`}>
                                    {acc.type}
                                  </span>
                                </div>
                                <div className="account-details">
                                  <p className="completed-text">🏆 Quest Complete!</p>
                                  <p>Final: {displayCurrency === 'crypto'
                                    ? `${parseFloat(acc.target || acc.balance).toLocaleString()} $OOOWEEE`
                                    : getOooweeeInFiat(acc.target || acc.balance, 'eur')
                                  }</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                <div className="create-section">
                  <h2>🎮 Start New Savings Quest</h2>
                  
                  <div className="form-group">
                    <select 
                      id="accountType" 
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="select-input"
                    >
                      <option value="time">⏰ Time Quest - Lock until date</option>
                      <option value="growth">🌱 Growth Quest - Grow to target</option>
                      <option value="balance">⚖️ Balance Quest - Send at target</option>
                    </select>
                  </div>
                  
                  {/* Currency selector for all account types */}
                  <div className="form-group">
                    <label>💱 Display Currency:</label>
                    <select 
                      value={accountCurrency}
                      onChange={(e) => setAccountCurrency(e.target.value)}
                      className="select-input"
                    >
                      {Object.entries(CURRENCIES).map(([code, info]) => (
                        <option key={code} value={code}>
                          {info.symbol} {info.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <input 
                      type="text" 
                      placeholder="Quest name (e.g., Epic Vacation)" 
                      id="goalName"
                      className="text-input"
                    />
                  </div>
                  
                  <div className="form-group">
                    <input 
                      type="number" 
                      placeholder="Initial deposit $OOOWEEE (any amount > 0)" 
                      id="initialDeposit"
                      min="0.001"
                      step="0.001"
                      value={initialDepositInput}
                      onChange={(e) => setInitialDepositInput(e.target.value)}
                      className="number-input"
                    />
                    <p className="fee-note">
                      💡 1% creation fee from initial deposit
                    </p>
                    {parseFloat(balance) < parseFloat(initialDepositInput) && initialDepositInput && (
                      <p className="swap-notice">
                        ⚠️ Insufficient balance - will offer to buy with ETH
                      </p>
                    )}
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
                        placeholder={`Target in ${accountCurrency}`}
                        id="targetAmount"
                        min="1"
                        step="0.01"
                        className="number-input"
                        value={targetAmountInput}
                        onChange={(e) => setTargetAmountInput(e.target.value)}
                      />
                      {targetAmountInput && (
                        <>
                          <p className="input-helper">
                            {formatCurrency(targetAmountInput, accountCurrency)}
                          </p>
                          <p className="conversion-helper">
                            ≈ {convertFiatToOooweee(targetAmountInput, accountCurrency).toLocaleString()} $OOOWEEE at current price
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  
                  {accountType === 'balance' && (
                    <div className="form-group">
                      <input 
                        type="text" 
                        placeholder="Recipient wallet (0x...)"
                        id="recipientAddress"
                        className="text-input"
                      />
                      <p className="help-text">
                        ⚠️ Save 101% to cover the 1% transfer fee!
                      </p>
                    </div>
                  )}
                  
                  <button 
                    onClick={handleCreateAccount}
                    disabled={loading}
                    className="create-btn rainbow-btn"
                  >
                    {loading ? '⏳ Creating Quest...' : '🚀 START QUEST'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </header>
    </div>
  );
}

export default App;