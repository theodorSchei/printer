# Printer
Program som printer ut bilder fra en gitt mappe fortløpende på en kvitteringsprinter.

## Sette opp python

Har tatt i bruk uv for første gang som skal gjøre det enkelt å få opp å kjøre
```zsh
uv run main.py
```

## Split routing

For å kunne sende trafikk til printeren over ethernet, men resten av trafikken på vanlig wifi må man sette opp noen spesifikke routes.

```zsh
# Finne riktig interface
netstat -rn

# Legg til route mot printers ip på riktig interface
sudo route add -host <printer-ip> -interface <interface> 
# sudo route add -host 192.168.0.237 -interface en7 

# Tømme arp-cache
sudo arp -d 192.168.0.237
```

