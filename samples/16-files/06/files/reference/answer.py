n = int(input())
count = 0
total = 0
if n == 0:
    count = 1
while n > 0:
    digit = n % 10
    if digit % 2 == 0:
        count += 1
        total += digit
    n //= 10
print(count, total)
