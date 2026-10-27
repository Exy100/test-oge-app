count = 0
x = int(input())
while x != 0:
    if 512 <= x < 4096 and x % 8 == 5:
        count += 1
    x = int(input())
print(count)
